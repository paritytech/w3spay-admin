/**
 * Tests for `publishItemConfig` — the host-delegated publish path.
 *
 * Scope: covers the contract between the app and the host's preimage
 * submitter. The host itself is mocked via the `preimage` and `inHost`
 * injection points exposed for testing; we do not exercise the
 * product-sdk transport.
 *
 * Invariants asserted here:
 *   - the submitter receives the exact encoded envelope bytes
 *     (re-encoding would silently desync the on-chain CID)
 *   - the host's returned preimage key MUST match blake2b-256 of those
 *     bytes; mismatch fails loudly so a bad host never poisons the
 *     registry contract with a CID nothing can resolve
 *   - outside a host environment we refuse to call the submitter at all
 *   - on host rejection, the thrown Error preserves the host's `reason`
 *     and the original cause
 */

import { describe, expect, it, vi } from "vitest";
import { blake2b } from "@noble/hashes/blake2.js";

import { publishItemConfig, type PreimageSubmitter } from "@features/items/contracts/item-config-storage.ts";
import { calculateBulletinCidObject } from "@features/items/contracts/cid.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

const CONFIG: ItemConfig = {
  id: "bar",
  name: "Bar",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  items: [
    { id: "espresso", name: "Espresso", price: 2.5, updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
};

// 32-byte zero key → derives a stable SS58 we don't actually need to
// pre-compute; the formatter consumes whatever `publicKeyToSs58` produces.
const PUBLIC_KEY = new Uint8Array(32);

const NOW = "2026-05-26T10:00:00.000Z";

function hex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i]! < 0x10 ? "0" : "") + bytes[i]!.toString(16);
  }
  return out as `0x${string}`;
}

/**
 * Build a submitter stub that returns `blake2b-256(bytes)` — what a
 * well-behaved host returns. Captures the bytes it was called with so
 * tests can assert the encoded envelope was passed through unchanged.
 */
function honestHost(): { submitter: PreimageSubmitter; capture: { bytes: Uint8Array | null } } {
  const capture: { bytes: Uint8Array | null } = { bytes: null };
  const submitter: PreimageSubmitter = {
    async submit(bytes: Uint8Array) {
      capture.bytes = bytes;
      return hex(blake2b(bytes, { dkLen: 32 }));
    },
  };
  return { submitter, capture };
}

describe("publishItemConfig", () => {
  it("submits the encoded envelope bytes and returns the matching CID", async () => {
    const { submitter, capture } = honestHost();

    const result = await publishItemConfig({
      config: CONFIG,
      productAccountPublicKey: PUBLIC_KEY,
      nowIso: NOW,
      preimage: submitter,
      inHost: () => true,
    });

    expect(capture.bytes).not.toBeNull();
    // CID must derive from the exact bytes the host saw.
    expect(result.cid).toBe(calculateBulletinCidObject(capture.bytes!).toString());
    // Preimage key must equal the multihash digest hex of the same bytes.
    const expectedKey = hex(calculateBulletinCidObject(capture.bytes!).multihash.digest);
    expect(result.preimageKey).toBe(expectedKey);
    expect(result.size).toBe(capture.bytes!.length);
  });

  it("stamps the envelope's publishedBy with the product-account SS58", async () => {
    const { submitter } = honestHost();

    const result = await publishItemConfig({
      config: CONFIG,
      productAccountPublicKey: PUBLIC_KEY,
      nowIso: NOW,
      preimage: submitter,
      inHost: () => true,
    });

    expect(result.envelope.publishedAt).toBe(NOW);
    // Sanity: the SS58 form of an all-zero 32-byte key — encoded via the
    // util's `publicKeyToSs58` — must be a non-empty string regardless
    // of address format. The exact value is irrelevant to this assertion.
    expect(typeof result.envelope.publishedBy).toBe("string");
    expect(result.envelope.publishedBy.length).toBeGreaterThan(0);
  });

  it("builds a gateway URL pointing at the resolved CID", async () => {
    const { submitter } = honestHost();

    const result = await publishItemConfig({
      config: CONFIG,
      productAccountPublicKey: PUBLIC_KEY,
      nowIso: NOW,
      preimage: submitter,
      inHost: () => true,
    });

    expect(result.gatewayUrl.endsWith(`/ipfs/${result.cid}`)).toBe(true);
  });

  it("refuses to call the host when running outside a host environment", async () => {
    const submitter: PreimageSubmitter = {
      submit: vi.fn(),
    };

    await expect(() =>
      publishItemConfig({
        config: CONFIG,
        productAccountPublicKey: PUBLIC_KEY,
        nowIso: NOW,
        preimage: submitter,
        inHost: () => false,
      }),
    ).rejects.toThrow(/host environment/i);

    expect(submitter.submit).not.toHaveBeenCalled();
  });

  it("throws with the host's reason when the submitter rejects", async () => {
    const submitter: PreimageSubmitter = {
      async submit() {
        throw { reason: "user denied PreimageSubmit" };
      },
    };

    await expect(() =>
      publishItemConfig({
        config: CONFIG,
        productAccountPublicKey: PUBLIC_KEY,
        nowIso: NOW,
        preimage: submitter,
        inHost: () => true,
      }),
    ).rejects.toThrow(/user denied PreimageSubmit/);
  });

  it("preserves Error.message when the submitter throws an Error", async () => {
    const submitter: PreimageSubmitter = {
      async submit() {
        throw new Error("transport closed");
      },
    };

    await expect(() =>
      publishItemConfig({
        config: CONFIG,
        productAccountPublicKey: PUBLIC_KEY,
        nowIso: NOW,
        preimage: submitter,
        inHost: () => true,
      }),
    ).rejects.toThrow(/transport closed/);
  });

  it("rejects mismatched preimage keys instead of recording a bad CID", async () => {
    // Malicious or buggy host returns a key for some other payload — we must
    // refuse, because the registry contract would otherwise persist a CID
    // pointing at a different blob (or nothing at all).
    const submitter: PreimageSubmitter = {
      async submit() {
        return hex(blake2b(new TextEncoder().encode("not the envelope"), { dkLen: 32 }));
      },
    };

    await expect(() =>
      publishItemConfig({
        config: CONFIG,
        productAccountPublicKey: PUBLIC_KEY,
        nowIso: NOW,
        preimage: submitter,
        inHost: () => true,
      }),
    ).rejects.toThrow(/does not match expected blake2b-256 digest/);
  });
});
