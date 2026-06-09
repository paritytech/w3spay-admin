// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Queries for processor-published Z reports: the on-chain per-group index
 * (public metadata) and the decrypted report documents (group passkey
 * required). The passkey never enters a query key — rows are keyed by
 * `(cid, unlockNonce)` so a re-unlock with a different passkey refetches.
 */
import { queryOptions } from "@tanstack/react-query";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import {
  listProcessorReports,
  type ProcessorReportIndexEntry,
} from "./processor-report-read.ts";
import { processorConfigRegistryConfigured } from "@features/payment-processors/contracts/processor-config-queries.ts";
import {
  CredentialEnvelopeError,
  decryptCredentialEnvelope,
} from "@shared/utils/wire/credential-envelope.ts";
import { gatewayUrlForCid } from "@features/items/contracts/item-config-storage.ts";
import {
  parseProcessorReportDoc,
  type ProcessorReportDoc,
} from "@features/reports/processor-report.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys } from "@shared/chain/keys.ts";

export type { ProcessorReportIndexEntry } from "./processor-report-read.ts";

/** Mirrors the processor's own cap on fetched envelopes (reports are small). */
const MAX_REPORT_ENVELOPE_BYTES = 1024 * 1024;

export function processorReportIndexQueryOptions(groupId: string) {
  return queryOptions({
    queryKey: queryKeys.processorReportIndex(groupId),
    queryFn: (): Promise<ReadonlyArray<ProcessorReportIndexEntry>> =>
      // Demo groups exist but publish no reports — the empty index is the
      // demo surface's standard state (same convention as t3rminal reports).
      isDemoMode()
        ? Promise.resolve([])
        : withSpan("w3spay-admin:processor-report-index.list", "chain.read", () =>
            listProcessorReports(groupId),),
    enabled: isDemoMode() || processorConfigRegistryConfigured(),
  });
}

export type ProcessorReportLoadResult =
  | { readonly kind: "ready"; readonly doc: ProcessorReportDoc }
  | { readonly kind: "fetch-error"; readonly reason: string }
  | { readonly kind: "decrypt-error" }
  | { readonly kind: "invalid"; readonly reason: string };

export interface LoadProcessorReportArgs {
  readonly groupId: string;
  readonly cid: string;
  readonly passkey: string;
  readonly gatewayBase: string;
  /** Test seam — defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Fetch an encrypted report envelope from the IPFS gateway, decrypt it with
 * the group passkey, and parse the `ProcessorReportDoc`. Never throws — every
 * failure maps to a result kind the row UI renders inline.
 */
export async function loadProcessorReport(
  args: LoadProcessorReportArgs,
): Promise<ProcessorReportLoadResult> {
  const url = gatewayUrlForCid(args.gatewayBase, args.cid);
  // Wrapped, not `?? fetch`: a detached `fetch` reference throws
  // "Illegal invocation" in browsers (Window receiver lost).
  const doFetch =
    args.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  let text: string;
  try {
    const response = await doFetch(url, { cache: "no-store" });
    if (!response.ok) {
      return { kind: "fetch-error", reason: `Gateway returned HTTP ${response.status}.` };
    }
    text = await response.text();
  } catch {
    return { kind: "fetch-error", reason: `Couldn't reach the IPFS gateway (${url}).` };
  }
  if (text.length > MAX_REPORT_ENVELOPE_BYTES) {
    return { kind: "invalid", reason: "Envelope is unexpectedly large — refusing to process." };
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(text) as unknown;
  } catch {
    return { kind: "invalid", reason: "The gateway did not return a JSON envelope." };
  }

  let plaintext: Uint8Array;
  try {
    plaintext = await decryptCredentialEnvelope(envelope, args.passkey);
  } catch (caught) {
    if (caught instanceof CredentialEnvelopeError) {
      // Wrong passkey and tampering are indistinguishable under AES-GCM.
      return { kind: "decrypt-error" };
    }
    return {
      kind: "invalid",
      reason: caught instanceof Error ? caught.message : String(caught),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch {
    return { kind: "invalid", reason: "Decrypted payload is not JSON." };
  }

  const doc = parseProcessorReportDoc(parsed, args.groupId);
  if (doc == null) {
    return { kind: "invalid", reason: "unrecognized report format" };
  }
  return { kind: "ready", doc };
}
