// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { preimageManager } from "@/shared/chain/host/index.ts";

import { envConfig } from "@/config.ts";
import {
  type FetchBulletinPreimage,
  fetchBulletinPreimage,
  resolveNetwork,
} from "@shared/chain/host";
import { isInHost } from "@shared/chain/host-connection.ts";
import { publicKeyToSs58 } from "@shared/lib/address.ts";
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
  /** Host preimage fetch. Defaults to the real transport; tests stub it. */
  readonly fetchPreimage?: FetchBulletinPreimage;
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
 * Fetch an item-config envelope by CID and decode it via the v1 decoder.
 *
 * In a host, content is read over the host transport (`window.truapi`);
 * an HTTPS IPFS gateway is used only as a standalone/dev fallback. Returns
 * `null` on a miss or decode failure (the caller decides retry vs. surface).
 */
export async function fetchItemConfigEnvelope(
  opts: FetchItemConfigEnvelopeOptions,
): Promise<W3SPayItemConfigEnvelopeV1 | null> {
  const fetchPreimage = opts.fetchPreimage ?? fetchBulletinPreimage;
  const pre = await fetchPreimage(opts.cid, { signal: opts.signal, timeoutMs: opts.timeoutMs });
  if (pre.kind === "ok") return decodeItemConfigEnvelope(pre.bytes);
  if (pre.kind === "unavailable") {
    console.warn(`[bulletin] preimage unavailable for ${opts.cid}: ${pre.reason}`);
    return null;
  }
  return fetchItemConfigEnvelopeViaGateway(opts);
}

async function fetchItemConfigEnvelopeViaGateway(
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
