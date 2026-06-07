/**
 * Bulletin Chain CID computation.
 *
 * Bulletin Chain identifies stored payloads by raw-codec CIDv1 with a
 * Blake2b-256 multihash (`dkLen: 32`). The bytes the chain hashes are
 * exactly the bytes passed to `TransactionStorage.store`, so callers
 * MUST hash the same buffer they upload — re-encoding (e.g. minifying
 * JSON before upload but not before CID) silently produces a CID that
 * does not match the on-chain entry.
 *
 * Ported from `apps/t3rminal-v1/lib/bulletin/cid.ts`. We keep the
 * implementation co-located in this workspace so the admin app does not
 * pull a Next.js-only module.
 */

import { blake2b } from "@noble/hashes/blake2.js";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import type { MultihashDigest } from "multiformats/hashes/interface";

/** Blake2b-256 multicodec code (CID spec). */
export const BLAKE2B_256_CODE = 0xb220;

/** Length in bytes of the Blake2b-256 digest. */
export const BLAKE2B_256_LENGTH = 32;

/**
 * Compute the CID Bulletin Chain will index `data` under, as a string.
 *
 * Deterministic in `data`. Allocates a single multihash buffer; the
 * `CID.toString()` allocation is unavoidable since the CID class is the
 * one piece of multiformats that owns its own base32 encoder.
 */
export function calculateBulletinCid(data: Uint8Array): string {
  return calculateBulletinCidObject(data).toString();
}

/**
 * Lower-level: return the raw `CID` instance. Test/diagnostic code uses
 * this to inspect the multihash bytes; production code should prefer
 * `calculateBulletinCid` which returns the string form the chain stores.
 */
export function calculateBulletinCidObject(data: Uint8Array): CID {
  const hash = blake2b(data, { dkLen: BLAKE2B_256_LENGTH });
  const digest = encodeBlake2bMultihash(hash);
  return CID.createV1(raw.code, digest);
}

function encodeBlake2bMultihash(hash: Uint8Array): MultihashDigest {
  const codeBytes = encodeVarint(BLAKE2B_256_CODE);
  const lengthBytes = encodeVarint(hash.length);
  const bytes = new Uint8Array(codeBytes.length + lengthBytes.length + hash.length);
  bytes.set(codeBytes, 0);
  bytes.set(lengthBytes, codeBytes.length);
  bytes.set(hash, codeBytes.length + lengthBytes.length);
  return {
    code: BLAKE2B_256_CODE,
    size: hash.length,
    bytes,
    digest: hash,
  };
}

function encodeVarint(value: number): Uint8Array {
  const out: number[] = [];
  let n = value;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n & 0x7f);
  return new Uint8Array(out);
}
