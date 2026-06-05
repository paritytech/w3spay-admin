/**
 * Bulletin CID is the on-chain identity of every published item config.
 *
 * The chain hashes the raw bytes of the `TransactionStorage.store`
 * payload with Blake2b-256 and wraps the digest in a raw-codec CIDv1.
 * If we change the bytes (re-minify, add a field, re-order keys) the
 * CID has to change — otherwise the on-chain registry record points at
 * the wrong content. These tests pin that invariant.
 */

import { describe, expect, it } from "vitest";
import { blake2b } from "@noble/hashes/blake2.js";
import { CID } from "multiformats/cid";

import { BLAKE2B_256_CODE, calculateBulletinCid, calculateBulletinCidObject } from "@features/items/api/cid.ts";

const HELLO = new TextEncoder().encode("hello world");
const EMPTY = new Uint8Array();

describe("Bulletin CID", () => {
  it("is deterministic for the same bytes", () => {
    expect(calculateBulletinCid(HELLO)).toEqual(calculateBulletinCid(HELLO));
  });

  it("changes when the input changes", () => {
    expect(calculateBulletinCid(HELLO)).not.toEqual(
      calculateBulletinCid(new TextEncoder().encode("hello world!")),
    );
  });

  it("uses raw codec + Blake2b-256 multihash", () => {
    const cid = calculateBulletinCidObject(HELLO);
    expect(cid.version).toBe(1);
    // raw multicodec = 0x55
    expect(cid.code).toBe(0x55);
    expect(cid.multihash.code).toBe(BLAKE2B_256_CODE);
    expect(cid.multihash.digest.length).toBe(32);
    // The digest must equal a fresh Blake2b-256 over the same input.
    const expected = blake2b(HELLO, { dkLen: 32 });
    expect(Array.from(cid.multihash.digest)).toEqual(Array.from(expected));
  });

  it("survives a round-trip through `CID.parse(...)`", () => {
    const string = calculateBulletinCid(HELLO);
    const parsed = CID.parse(string);
    expect(parsed.toString()).toEqual(string);
  });

  it("handles empty input", () => {
    const cid = calculateBulletinCid(EMPTY);
    // Standard Blake2b-256 of empty bytes — known value:
    //   0x0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8
    const expected = blake2b(EMPTY, { dkLen: 32 });
    expect(Array.from(calculateBulletinCidObject(EMPTY).multihash.digest)).toEqual(
      Array.from(expected),
    );
    expect(cid).toMatch(/^bafk/);
  });
});
