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
import { type FetchBulletinPreimage, fetchBulletinPreimage } from "@shared/chain/host";
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
  /** Host preimage fetch. Defaults to the real transport; tests stub it. */
  readonly fetchPreimage?: FetchBulletinPreimage;
}

/**
 * Resolve an encrypted report envelope by CID, decrypt it with the group
 * passkey, and parse the `ProcessorReportDoc`. In a host, content is read
 * over the host transport (`window.truapi`); an HTTPS IPFS gateway is used
 * only as a standalone/dev fallback. Never throws — every failure maps to a
 * result kind the row UI renders inline.
 */
export async function loadProcessorReport(
  args: LoadProcessorReportArgs,
): Promise<ProcessorReportLoadResult> {
  const fetchPreimage = args.fetchPreimage ?? fetchBulletinPreimage;
  const pre = await fetchPreimage(args.cid);
  if (pre.kind === "ok") return decodeProcessorReport(pre.bytes, args.groupId, args.passkey);
  if (pre.kind === "unavailable") return { kind: "fetch-error", reason: pre.reason };

  const gateway = await fetchReportViaGateway(args.cid, args.gatewayBase, args.fetchImpl);
  if (gateway.kind === "fetch-error") return gateway;
  return decodeProcessorReport(gateway.bytes, args.groupId, args.passkey);
}

async function fetchReportViaGateway(
  cid: string,
  gatewayBase: string,
  fetchImpl?: typeof fetch,
): Promise<{ kind: "ok"; bytes: Uint8Array } | { kind: "fetch-error"; reason: string }> {
  const url = gatewayUrlForCid(gatewayBase, cid);
  // A detached `fetch` reference loses its Window receiver — wrap, don't alias.
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const response = await doFetch(url, { cache: "no-store" });
    if (!response.ok) {
      return { kind: "fetch-error", reason: `Gateway returned HTTP ${response.status}.` };
    }
    return { kind: "ok", bytes: new Uint8Array(await response.arrayBuffer()) };
  } catch {
    return { kind: "fetch-error", reason: `Couldn't reach the IPFS gateway (${url}).` };
  }
}

async function decodeProcessorReport(
  bytes: Uint8Array,
  groupId: string,
  passkey: string,
): Promise<ProcessorReportLoadResult> {
  if (bytes.length > MAX_REPORT_ENVELOPE_BYTES) {
    return { kind: "invalid", reason: "Envelope is unexpectedly large — refusing to process." };
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return { kind: "invalid", reason: "Bulletin payload was not a JSON envelope." };
  }

  let plaintext: Uint8Array;
  try {
    plaintext = await decryptCredentialEnvelope(envelope, passkey);
  } catch (caught) {
    if (caught instanceof CredentialEnvelopeError) {
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

  const doc = parseProcessorReportDoc(parsed, groupId);
  if (doc == null) {
    return { kind: "invalid", reason: "unrecognized report format" };
  }
  return { kind: "ready", doc };
}
