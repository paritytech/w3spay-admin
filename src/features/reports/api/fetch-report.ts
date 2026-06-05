/**
 * Fetch an encrypted daily-report envelope from the configured IPFS
 * gateway and run it through the v2 decoder.
 *
 * Mirrors `fetchItemConfigEnvelope` in shape — same abort/timeout
 * plumbing — but the payload is JSON (not a CBOR/Borsh envelope) and
 * the decoder distinguishes between v2, legacy-v1, and invalid so the
 * UI can render the appropriate state.
 *
 * Returns a discriminated result so the caller knows which UI state to
 * render even on the unhappy paths. The hook layer
 * (`use-decrypted-report.ts`) layers decryption on top.
 */

import {
  decodeEncryptedReportEnvelope,
  type EncryptedReportEnvelope,
} from "@features/reports/encrypted-report.ts";
import { gatewayUrlForCid } from "@features/items/api/item-config-storage.ts";

export interface FetchReportOptions {
  readonly cid: string;
  readonly gatewayBase: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export type FetchReportResult =
  | { readonly kind: "ok"; readonly envelope: EncryptedReportEnvelope }
  | { readonly kind: "http-error"; readonly status: number; readonly statusText: string }
  | { readonly kind: "network-error"; readonly reason: string }
  | { readonly kind: "json-error"; readonly reason: string };

/** Same default as `fetchItemConfigEnvelope` — long enough for cold IPFS gateways. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * GET `<gatewayBase>/ipfs/<cid>`, parse as JSON, and run through
 * `decodeEncryptedReportEnvelope`. The decode is intentionally inside
 * the success path: a bad envelope is `{ kind: "ok", envelope: { kind:
 * "invalid", ... } }` — the network request succeeded, the *content*
 * is unrecognised.
 */
export async function fetchReportEnvelope(
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
