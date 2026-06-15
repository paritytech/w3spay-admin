// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchReportEnvelope } from "./fetch-report.ts";
import { parseDailyReport, type DailyReport } from "@features/reports/daily-report.ts";
import {
  decryptReportV2,
  DecryptReportError,
  type DecryptedReportState,
  type EncryptedReportEnvelopeV2,
  type EncryptedReportMeta,
  type UseDecryptedReportArgs,
} from "@features/reports/encrypted-report.ts";
import { queryKeys } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

// ── Shared decrypt-error formatting ────────────────────────────────

function decryptReason(caught: unknown): string {
  if (caught instanceof DecryptReportError) {
    return `${caught.code}: ${caught.message}`;
  }
  if (caught instanceof Error) return caught.message;
  return String(caught);
}

type CandidateDecrypt =
  | { readonly ok: true; readonly plaintext: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Try each candidate passphrase against a v2 envelope in order. A wrong key
 * (`authFailed`) advances to the next; corrupt ciphertext
 * (`malformedCiphertext`) fails immediately regardless of key. Returns the
 * last failure reason once all candidates are exhausted.
 */
function decryptWithCandidates(
  envelope: EncryptedReportEnvelopeV2,
  passwords: ReadonlyArray<string>,
): CandidateDecrypt {
  let reason = "no candidate passphrase";
  for (const password of passwords) {
    try {
      return { ok: true, plaintext: decryptReportV2(envelope, password) };
    } catch (caught) {
      reason = decryptReason(caught);
      if (caught instanceof DecryptReportError && caught.code === "malformedCiphertext") {
        break;
      }
    }
  }
  return { ok: false, reason };
}

// ── Single decrypted report (detail panel) ─────────────────────────

/**
 * Categorized result of decrypting a single report for the detail panel.
 * Carries `meta` on the success / legacy paths so the panel can render
 * the envelope header without re-fetching.
 */
export type DecryptedReportLoadResult =
  | { readonly kind: "ready"; readonly report: DailyReport; readonly meta: EncryptedReportMeta }
  | { readonly kind: "legacy-v1"; readonly meta: EncryptedReportMeta | null }
  | { readonly kind: "corrupt"; readonly reason: string }
  | { readonly kind: "decrypt-error"; readonly reason: string; readonly meta: EncryptedReportMeta }
  | { readonly kind: "parse-error" }
  | { readonly kind: "fetch-error"; readonly reason: string };

/**
 * Fetch + decode + decrypt + parse one (cid, password) pair. Never
 * throws — resolves to a {@link DecryptedReportLoadResult}. Unlike the
 * stream path this is an on-demand single read, so it does not take a
 * semaphore slot.
 */
async function loadDecryptedReport(
  cid: string,
  passwords: ReadonlyArray<string>,
  gatewayBase: string,
): Promise<DecryptedReportLoadResult> {
  const result = await fetchReportEnvelope({ cid, gatewayBase });
  if (result.kind === "http-error") {
    return { kind: "fetch-error", reason: `HTTP ${result.status} ${result.statusText}` };
  }
  if (result.kind === "network-error" || result.kind === "json-error") {
    return { kind: "fetch-error", reason: result.reason };
  }
  const envelope = result.envelope;
  if (envelope.kind === "invalid") {
    return { kind: "corrupt", reason: envelope.reason };
  }
  if (envelope.kind === "legacy-v1") {
    return { kind: "legacy-v1", meta: envelope.meta };
  }
  // envelope.kind === "v2"
  const decrypted = decryptWithCandidates(envelope.envelope, passwords);
  if (!decrypted.ok) {
    return { kind: "decrypt-error", reason: decrypted.reason, meta: envelope.envelope.meta };
  }
  let json: unknown;
  try {
    json = JSON.parse(decrypted.plaintext);
  } catch {
    return { kind: "parse-error" };
  }
  const report = parseDailyReport(json);
  if (report == null) {
    return { kind: "parse-error" };
  }
  return { kind: "ready", report, meta: envelope.envelope.meta };
}

export function decryptedReportQueryOptions(
  cid: string | null,
  passwords: ReadonlyArray<string>,
  unlockNonce: number,
  gatewayBase: string,
) {
  return queryOptions({
    queryKey: queryKeys.decryptedReport(cid ?? "", unlockNonce),
    queryFn: (): Promise<DecryptedReportLoadResult> => {
      // `enabled` guarantees a non-null cid + at least one candidate.
      if (cid == null) {
        throw new Error("decryptedReportQueryOptions: cid is null");
      }
      return loadDecryptedReport(cid, passwords, gatewayBase);
    },
    enabled: cid != null && passwords.length > 0,
    // Reports are immutable content-addressed documents — the saved-days list
    // fans these out per day, so don't refetch on every remount.
    staleTime: Infinity,
  });
}

/**
 * Adapter hook: project the single-report query into the
 * `DecryptedReportState` union the detail panel switches on. `idle` for a
 * null cid/password, `loading` while pending, then the categorized
 * outcome. `refresh` invalidates the report's key so a retry re-runs.
 */
export function useDecryptedReport(args: UseDecryptedReportArgs): DecryptedReportState {
  const { cid, passwords, unlockNonce, gatewayBase } = args;
  const query = useQuery(decryptedReportQueryOptions(cid, passwords, unlockNonce, gatewayBase));

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.decryptedReport(cid ?? "", unlockNonce),
    });
  }, [cid, unlockNonce]);

  if (cid == null || passwords.length === 0) {
    return { kind: "idle" };
  }
  const data = query.data;
  if (data == null) {
    return { kind: "loading" };
  }
  switch (data.kind) {
    case "ready":
      return { kind: "ready", report: data.report, meta: data.meta, refresh };
    case "legacy-v1":
      return { kind: "legacy-v1", meta: data.meta, refresh };
    case "corrupt":
      return { kind: "corrupt", reason: data.reason, refresh };
    case "decrypt-error":
      return { kind: "decrypt-error", reason: data.reason, meta: data.meta, refresh };
    case "parse-error":
      return { kind: "parse-error", refresh };
    case "fetch-error":
      return { kind: "fetch-error", reason: data.reason, refresh };
  }
}
