/**
 * Bulletin Chain item-config publish + fetch pipeline.
 *
 * Publish path delegates the on-chain step to the host via
 * `preimageManager.submit` (product-sdk). The host (Polkadot Desktop /
 * dotli) holds the Bulletin Chain authorization and signs
 * `TransactionStorage.store(data)` with its own account. The app never
 * touches a Bulletin Chain PAPI client, never builds an extrinsic, and
 * never asks the user to authorize a per-product-account submission —
 * the host prompts for the `PreimageSubmit` remote permission once and
 * then handles every subsequent submit transparently.
 *
 * Pipeline:
 *   1. Build + minify-encode the v1 envelope (`buildAndEncodeItemConfigEnvelope`).
 *      The product account's SS58 still appears as `publishedBy` inside the
 *      envelope so application-level attribution is preserved, even though
 *      the host account is the one that signs the bulletin extrinsic.
 *   2. Compute the CID up-front so the caller knows the canonical address
 *      before the host confirms storage.
 *   3. `preimageManager.submit(bytes)` — host returns the 32-byte preimage
 *      key (= blake2b-256(bytes) hex). We assert it matches the CID's
 *      multihash digest as a defensive sanity check; a mismatch would mean
 *      the host re-encoded the payload, which would silently desync the
 *      on-chain entry from `cid`.
 *   4. The host's chain inclusion (block, tx index) is not exposed to
 *      the product and is not tracked anywhere in the app. Renewal — if
 *      ever needed — is the host's responsibility, since the host owns
 *      the signing account.
 *
 * Fetch:
 *   - GET `<gateway>/ipfs/<cid>`, parse the envelope through the v1
 *     decoder; return `null` on any decode failure. Unaffected by the
 *     publish-path change.
 *
 * No encryption — item configs are intentionally public.
 */

import { preimageManager } from "@/shared/api/host/index.ts";

import { envConfig } from "@shared/config.ts";
import { resolveNetwork } from "@shared/api/host";
import { isInHost } from "@shared/api/host-connection.ts";
import { publicKeyToSs58 } from "@shared/utils/address.ts";
import {
  BLAKE2B_256_LENGTH,
  calculateBulletinCidObject,
} from "./cid.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import {
  buildAndEncodeItemConfigEnvelope,
  decodeItemConfigEnvelope,
  type W3SPayItemConfigEnvelopeV1,
} from "./envelope.ts";

export interface PublishItemConfigOptions {
  readonly config: ItemConfig;
  /**
   * Product-account public key used to stamp the envelope's `publishedBy`
   * field. The host is the one that signs the bulletin extrinsic, so this
   * value is purely application-level attribution.
   */
  readonly productAccountPublicKey: Uint8Array;
  /** Wall-clock now in ISO. Threaded in so tests can pin it. */
  readonly nowIso: string;
  /**
   * Optional preimage manager injection — defaults to the product-sdk
   * singleton. Tests pass a stub.
   */
  readonly preimage?: PreimageSubmitter;
  /** Optional host-presence guard — defaults to `isInHost`. Tests override. */
  readonly inHost?: () => boolean;
}

export interface PublishItemConfigResult {
  readonly cid: string;
  readonly gatewayUrl: string;
  readonly size: number;
  readonly envelope: W3SPayItemConfigEnvelopeV1;
  /** Preimage hash key returned by the host. 32-byte hex; matches the CID multihash. */
  readonly preimageKey: `0x${string}`;
}

export interface FetchItemConfigEnvelopeOptions {
  readonly cid: string;
  readonly gatewayBase: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Minimal contract the publish flow needs — matches `preimageManager.submit`. */
export interface PreimageSubmitter {
  submit(value: Uint8Array): Promise<`0x${string}`>;
}

/** Default per-gateway-fetch timeout. */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Publish `config` to Bulletin Chain via the host's preimage submitter.
 *
 * Throws when:
 *   - the app is running outside a host environment (no preimage transport),
 *   - the host returns an `Err` (e.g. user denied `PreimageSubmit`),
 *   - the host returns a preimage key that does not match the CID
 *     multihash — defensive guard against host-side re-encoding.
 *
 * Returns the canonical CID plus an IPFS gateway URL pointing at it so
 * the UI can show "view on IPFS" immediately.
 */
export async function publishItemConfig(
  opts: PublishItemConfigOptions,
): Promise<PublishItemConfigResult> {
  const inHost = opts.inHost ?? isInHost;
  if (!inHost()) {
    throw new Error(
      "Bulletin publish requires a host environment (Polkadot Desktop / dotli). " +
        "Open this app from a host so the host can sign the preimage submit on your behalf.",
    );
  }

  const publishedBy = publicKeyToSs58(opts.productAccountPublicKey);
  const { envelope, bytes } = buildAndEncodeItemConfigEnvelope({
    config: opts.config,
    publishedAt: opts.nowIso,
    publishedBy,
  });
  const cidObj = calculateBulletinCidObject(bytes);

  const submitter = opts.preimage ?? preimageManager;
  let preimageKey: `0x${string}`;
  try {
    preimageKey = await submitter.submit(bytes);
  } catch (caught) {
    throw new Error(
      `Host rejected preimage submit: ${formatPreimageError(caught)}`,
      { cause: caught },
    );
  }

  // Sanity check: the host's preimage key must equal blake2b-256(bytes),
  // which is exactly the multihash digest we wrapped into `cidObj`. If
  // the host re-encoded the payload (or hashed something else), the
  // on-chain entry would diverge from `cid` and reads would 404. Fail
  // loudly here instead of silently storing a broken record.
  const expectedDigest = cidObj.multihash.digest;
  const actualDigest = hexToBytes(preimageKey);
  if (!digestsMatch(expectedDigest, actualDigest)) {
    throw new Error(
      `Host preimage key ${preimageKey} does not match expected blake2b-256 digest ` +
        `${bytesToHex(expectedDigest)} for the encoded envelope. The host may have re-encoded ` +
        `the payload; refusing to record a mismatched CID in the registry.`,
    );
  }

  const cid = cidObj.toString();
  return {
    cid,
    gatewayUrl: gatewayUrlForCid(resolveNetwork(envConfig.chain.network).ipfsGateway, cid),
    size: bytes.length,
    envelope,
    preimageKey,
  };
}

/** Convenience: format the canonical IPFS gateway URL for a CID. */
export function gatewayUrlForCid(gatewayBase: string, cid: string): string {
  const base = trimTrailingSlash(gatewayBase);
  return `${base}/ipfs/${cid}`;
}

/**
 * Fetch an envelope by CID from the configured IPFS gateway and decode
 * via the v1 decoder. Returns `null` on HTTP/decode failure (the caller
 * is the one that knows whether to retry vs. surface).
 */
export async function fetchItemConfigEnvelope(
  opts: FetchItemConfigEnvelopeOptions,
): Promise<W3SPayItemConfigEnvelopeV1 | null> {
  const url = gatewayUrlForCid(opts.gatewayBase, opts.cid);
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return decodeItemConfigEnvelope(new Uint8Array(buffer));
  } catch (caught) {
    console.warn("[bulletin] fetchItemConfigEnvelope failed:", caught);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Internals ───────────────────────────────────────────────────────

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * The host returns a `Result<HexString, PreimageSubmitErr>` whose `Err`
 * variant is `{ reason: string }`. The product-sdk unwraps it to a
 * thrown Error / object. We accept the common shapes and degrade to
 * `String(err)`.
 */
function formatPreimageError(err: unknown): string {
  if (err == null) return "unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "reason" in err && typeof (err as { reason: unknown }).reason === "string") {
    return (err as { reason: string }).reason;
  }
  return String(err);
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
  const stripped = hex.slice(2);
  if (stripped.length % 2 !== 0) {
    throw new Error(`Odd-length hex string returned by host: ${hex}`);
  }
  const out = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(stripped.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i]! < 0x10 ? "0" : "") + bytes[i]!.toString(16);
  }
  return hex as `0x${string}`;
}

function digestsMatch(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== BLAKE2B_256_LENGTH || b.length !== BLAKE2B_256_LENGTH) return false;
  for (let i = 0; i < BLAKE2B_256_LENGTH; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
