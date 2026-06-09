// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { preimageManager } from "@/shared/chain/host/index.ts";

import { envConfig } from "@/config.ts";
import { resolveNetwork } from "@shared/chain/host";
import { isInHost } from "@shared/chain/host-connection.ts";
import {
  BLAKE2B_256_LENGTH,
  calculateBulletinCidObject,
} from "@features/items/contracts/cid.ts";
import {
  decryptCredentialEnvelope,
  encryptCredentialEnvelope,
} from "@shared/utils/wire/credential-envelope.ts";
import type { ProcessorConfigBundle } from "../payment-processor-model.ts";

export interface PublishProcessorConfigOptions {
  /** The plaintext config bundle to encrypt + publish. */
  readonly bundle: ProcessorConfigBundle;
  /** Group passkey the processor enters at unlock to decrypt the envelope. */
  readonly passkey: string;
  /**
   * Optional preimage manager injection — defaults to the product-sdk
   * singleton. Tests pass a stub.
   */
  readonly preimage?: PreimageSubmitter;
  /** Optional host-presence guard — defaults to `isInHost`. Tests override. */
  readonly inHost?: () => boolean;
}

export interface PublishProcessorConfigResult {
  readonly cid: string;
  readonly gatewayUrl: string;
  readonly size: number;
  /** Preimage hash key returned by the host. 32-byte hex; matches the CID multihash. */
  readonly preimageKey: `0x${string}`;
}

/** Minimal contract the publish flow needs — matches `preimageManager.submit`. */
export interface PreimageSubmitter {
  submit(value: Uint8Array): Promise<`0x${string}`>;
}

/**
 * Encrypt `bundle` with `passkey` (AES-256-GCM credential envelope) and
 * publish the envelope JSON to Bulletin via the host's preimage submitter,
 * returning the CID + size to record on the registry. Load-bearing order:
 * encrypt → decrypt self-check (never publish a bundle the processor can't
 * open) → CID the EXACT uploaded bytes → verify the host's preimage key
 * equals blake2b-256(bytes). Throws on any failure, before damage is done.
 */
export async function publishProcessorConfig(
  opts: PublishProcessorConfigOptions,
): Promise<PublishProcessorConfigResult> {
  const inHost = opts.inHost ?? isInHost;
  if (!inHost()) {
    throw new Error(
      "Bulletin publish requires a host environment (Polkadot Desktop / dotli). " +
        "Open this app from a host so the host can sign the preimage submit on your behalf.",
    );
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(opts.bundle));
  const envelope = await encryptCredentialEnvelope(plaintext, opts.passkey);

  const roundTrip = await decryptCredentialEnvelope(envelope, opts.passkey);
  if (!bytesEqual(roundTrip, plaintext)) {
    throw new Error(
      "Envelope self-check failed: decrypting the freshly-encrypted bundle did not " +
        "reproduce the plaintext. Refusing to publish a bundle the processor cannot open.",
    );
  }

  // These exact bytes are uploaded and CID'd — the JSON of the envelope object.
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  const cidObj = calculateBulletinCidObject(bytes);

  const submitter = opts.preimage ?? preimageManager;
  let preimageKey: `0x${string}`;
  try {
    preimageKey = await submitter.submit(bytes);
  } catch (caught) {
    throw new Error(`Host rejected preimage submit: ${formatPreimageError(caught)}`, {
      cause: caught,
    });
  }

  // The host's preimage key must equal blake2b-256(bytes) — exactly the
  // multihash digest in `cidObj`. A mismatch means the host re-encoded the
  // payload; refuse to record a CID the processor's reads would 404 on.
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
    preimageKey,
  };
}

/** Convenience: format the canonical IPFS gateway URL for a CID. */
export function gatewayUrlForCid(gatewayBase: string, cid: string): string {
  const base = gatewayBase.endsWith("/") ? gatewayBase.slice(0, -1) : gatewayBase;
  return `${base}/ipfs/${cid}`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * The host returns a `Result<HexString, PreimageSubmitErr>` whose `Err`
 * variant is `{ reason: string }`. Accept the common shapes and degrade to
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
