// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  decodeEncryptedReportEnvelope,
  type EncryptedReportEnvelope,
} from "@features/reports/encrypted-report.ts";
import { gatewayUrlForCid } from "@features/items/contracts/item-config-storage.ts";
import { type FetchBulletinPreimage, fetchBulletinPreimage } from "@shared/chain/host";

export interface FetchReportOptions {
  readonly cid: string;
  readonly gatewayBase: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Host preimage fetch. Defaults to the real transport; tests stub it. */
  readonly fetchPreimage?: FetchBulletinPreimage;
}

export type FetchReportResult =
  | { readonly kind: "ok"; readonly envelope: EncryptedReportEnvelope }
  | { readonly kind: "http-error"; readonly status: number; readonly statusText: string }
  | { readonly kind: "network-error"; readonly reason: string }
  | { readonly kind: "json-error"; readonly reason: string };

/** Same default as `fetchItemConfigEnvelope` — long enough for cold IPFS gateways. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Resolve an encrypted report envelope by CID and run it through
 * `decodeEncryptedReportEnvelope`.
 *
 * In a host, content is read over the host transport (`window.truapi`); an
 * HTTPS IPFS gateway is used only as a standalone/dev fallback. Decode runs
 * inside the success path: a bad envelope is `{ kind: "ok", envelope: {
 * kind: "invalid", ... } }` — the fetch succeeded, the *content* is
 * unrecognised.
 */
export async function fetchReportEnvelope(
  opts: FetchReportOptions,
): Promise<FetchReportResult> {
  const fetchPreimage = opts.fetchPreimage ?? fetchBulletinPreimage;
  const pre = await fetchPreimage(opts.cid, { signal: opts.signal, timeoutMs: opts.timeoutMs });
  if (pre.kind === "ok") {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(pre.bytes)) as unknown;
    } catch (caught) {
      return { kind: "json-error", reason: caught instanceof Error ? caught.message : String(caught) };
    }
    return { kind: "ok", envelope: decodeEncryptedReportEnvelope(json) };
  }
  if (pre.kind === "unavailable") {
    return { kind: "network-error", reason: pre.reason };
  }
  return fetchReportEnvelopeViaGateway(opts);
}

async function fetchReportEnvelopeViaGateway(
  opts: FetchReportOptions,
): Promise<FetchReportResult> {
  const url = gatewayUrlForCid(opts.gatewayBase, opts.cid);
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { kind: "http-error", status: response.status, statusText: response.statusText };
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (caught) {
      return {
        kind: "json-error",
        reason: caught instanceof Error ? caught.message : String(caught),
      };
    }
    return { kind: "ok", envelope: decodeEncryptedReportEnvelope(json) };
  } catch (caught) {
    // AbortError or genuine network failure — same UI state either way.
    return {
      kind: "network-error",
      reason: caught instanceof Error ? caught.message : String(caught),
    };
  } finally {
    clearTimeout(timer);
  }
}
