import { describe, expect, it } from "vitest";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";

import {
  bytesToHex,
  decodeEncryptedReportEnvelope,
  decryptReportV2,
  DecryptReportError,
  ENCRYPTED_REPORT_VERSION_V2,
  encryptReportV2,
  hexToBytes,
  keyFingerprint,
  passphraseToKey,
  REPORT_KEY_BYTES,
  type EncryptedReportEnvelopeV2,
  type EncryptedReportMeta,
} from "@features/reports/encrypted-report.ts";
import { deriveReportPasswordFromPasscode } from "@shared/lib/t3rminal-config-qr.ts";

// t3rminal accepts any passphrase (it trims + sha256), so admin fixtures use
// plain literal phrases — not the random base64url passwords of the old flow.
const PASSPHRASE = "correct horse battery staple";

const META: EncryptedReportMeta = {
  date: "2026-05-26",
  txCount: 3,
  terminal: "5Gh1xK8Qmf2c",
  encryptedAt: "2026-05-26T18:00:00.000Z",
};

const SAMPLE_REPORT_JSON = JSON.stringify({
  exportDate: "2026-05-26T18:00:00.000Z",
  selectedDate: "2026-05-26",
  network: "Paseo Asset Hub Next",
  rpcUrl: "https://example",
  totalTransactions: 0,
  dayFinalized: true,
  transactions: [],
});

/**
 * Build an envelope byte-identically to t3rminal's producer
 * (`lib/crypto/manual-key.ts` `deriveKeyFromPassphrase` +
 * `lib/crypto/symmetric-report.ts` / `primitives.ts` `xchachaEncryptPacked`),
 * using ONLY raw primitives — never admin's own helpers — so this is a true
 * cross-app compatibility vector and not a self-round-trip.
 */
function t3rminalProducedEnvelope(
  plaintext: string,
  passphrase: string,
  nonce: Uint8Array,
): EncryptedReportEnvelopeV2 {
  const key = sha256(new TextEncoder().encode(`t3rminal-manual-key:${passphrase.trim()}`));
  const ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  const packed = new Uint8Array(nonce.length + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, nonce.length);
  const fp = Array.from(sha256(key))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
  return {
    v: 2,
    encrypted: bytesToHex(packed),
    meta: { ...META, keyFingerprint: fp },
  };
}

/** Mirror of the report-queries candidate loop, kept in lockstep with its semantics. */
function tryCandidates(
  envelope: EncryptedReportEnvelopeV2,
  candidates: ReadonlyArray<string>,
): string | null {
  for (const candidate of candidates) {
    try {
      return decryptReportV2(envelope, candidate);
    } catch (caught) {
      // Corruption fails fast regardless of key; a wrong key just advances.
      if (caught instanceof DecryptReportError && caught.code === "malformedCiphertext") {
        throw caught;
      }
    }
  }
  return null;
}

describe("hexToBytes", () => {
  it("decodes lowercase hex without 0x prefix", () => {
    const bytes = hexToBytes("deadbeef");
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("tolerates an explicit 0x prefix", () => {
    const bytes = hexToBytes("0xdeadbeef");
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("rejects odd-length hex", () => {
    expect(hexToBytes("abc")).toBeNull();
  });

  it("rejects non-hex characters", () => {
    expect(hexToBytes("xyz123")).toBeNull();
  });
});

describe("passphraseToKey", () => {
  it("derives a 32-byte key from any passphrase", () => {
    expect(passphraseToKey(PASSPHRASE).length).toBe(REPORT_KEY_BYTES);
  });

  it("matches t3rminal's deriveKeyFromPassphrase byte-for-byte", () => {
    const expected = sha256(new TextEncoder().encode(`t3rminal-manual-key:${PASSPHRASE}`));
    expect(Array.from(passphraseToKey(PASSPHRASE))).toEqual(Array.from(expected));
  });

  it("trims surrounding whitespace before hashing", () => {
    expect(Array.from(passphraseToKey("  hello  "))).toEqual(Array.from(passphraseToKey("hello")));
  });
});

describe("keyFingerprint", () => {
  it("is 8 uppercase hex chars", () => {
    expect(keyFingerprint(passphraseToKey(PASSPHRASE))).toMatch(/^[0-9A-F]{8}$/);
  });

  it("matches t3rminal's manualKeyFingerprint formula (first 8 hex of sha256(key))", () => {
    const key = passphraseToKey(PASSPHRASE);
    const expected = Array.from(sha256(key))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 8)
      .toUpperCase();
    expect(keyFingerprint(key)).toBe(expected);
  });
});

describe("decodeEncryptedReportEnvelope", () => {
  it("accepts a well-formed v2 envelope (no scheme field)", () => {
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, PASSPHRASE, META);
    const decoded = decodeEncryptedReportEnvelope(envelope);
    expect(decoded.kind).toBe("v2");
    if (decoded.kind === "v2") {
      expect(decoded.envelope.v).toBe(ENCRYPTED_REPORT_VERSION_V2);
      expect(decoded.envelope.meta).toEqual(META);
    }
  });

  it("preserves an optional keyFingerprint on meta when present", () => {
    const envelope = t3rminalProducedEnvelope(SAMPLE_REPORT_JSON, PASSPHRASE, new Uint8Array(24).fill(1));
    const decoded = decodeEncryptedReportEnvelope(envelope);
    expect(decoded.kind).toBe("v2");
    if (decoded.kind === "v2") {
      expect(decoded.envelope.meta.keyFingerprint).toBe(envelope.meta.keyFingerprint);
    }
  });

  it("accepts a v2 envelope whose meta omits keyFingerprint", () => {
    const decoded = decodeEncryptedReportEnvelope({ v: 2, encrypted: "deadbeef", meta: META });
    expect(decoded.kind).toBe("v2");
    if (decoded.kind === "v2") {
      expect(decoded.envelope.meta.keyFingerprint).toBeUndefined();
    }
  });

  it("detects the legacy v1 (X25519 sealed-box) envelope shape", () => {
    const legacy = {
      v: 1,
      encrypted: "deadbeef",
      recipients: [{ pubkey: "00".repeat(32), wrappedKey: "11".repeat(64) }],
      meta: META,
    };
    const decoded = decodeEncryptedReportEnvelope(legacy);
    expect(decoded.kind).toBe("legacy-v1");
    if (decoded.kind === "legacy-v1") {
      expect(decoded.meta).toEqual(META);
    }
  });

  it("rejects a v2 envelope missing encrypted as invalid", () => {
    const decoded = decodeEncryptedReportEnvelope({ v: 2, meta: META });
    expect(decoded.kind).toBe("invalid");
  });

  it("rejects a v2 envelope missing meta as invalid", () => {
    const decoded = decodeEncryptedReportEnvelope({ v: 2, encrypted: "deadbeef" });
    expect(decoded.kind).toBe("invalid");
  });

  it("rejects null / non-object inputs", () => {
    expect(decodeEncryptedReportEnvelope(null).kind).toBe("invalid");
    expect(decodeEncryptedReportEnvelope("hello").kind).toBe("invalid");
    expect(decodeEncryptedReportEnvelope(42).kind).toBe("invalid");
  });

  it("rejects a future v3 envelope as invalid (forward compat is a separate decision)", () => {
    const decoded = decodeEncryptedReportEnvelope({ v: 3, encrypted: "deadbeef", meta: META });
    expect(decoded.kind).toBe("invalid");
    if (decoded.kind === "invalid") {
      expect(decoded.reason).toMatch(/unrecognised envelope version/);
    }
  });
});

describe("encryptReportV2 + decryptReportV2", () => {
  it("round-trips the report verbatim", () => {
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, PASSPHRASE, META);
    const decrypted = decryptReportV2(envelope, PASSPHRASE);
    expect(decrypted).toBe(SAMPLE_REPORT_JSON);
  });

  it("uses a unique random nonce when none is supplied", () => {
    const a = encryptReportV2(SAMPLE_REPORT_JSON, PASSPHRASE, META);
    const b = encryptReportV2(SAMPLE_REPORT_JSON, PASSPHRASE, META);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it("rejects decryption with a different passphrase (authFailed)", () => {
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, PASSPHRASE, META);
    expect(() => decryptReportV2(envelope, "the wrong passphrase")).toThrow(DecryptReportError);
    try {
      decryptReportV2(envelope, "the wrong passphrase");
    } catch (caught) {
      expect((caught as DecryptReportError).code).toBe("authFailed");
    }
  });

  it("rejects malformed ciphertext (too short for the nonce)", () => {
    const envelope = {
      v: ENCRYPTED_REPORT_VERSION_V2,
      encrypted: "deadbeef", // 4 bytes — less than nonce(24)
      meta: META,
    } as const;
    expect(() => decryptReportV2(envelope, PASSPHRASE)).toThrow(/ciphertext shorter than nonce/);
  });

  it("rejects malformed ciphertext (non-hex)", () => {
    const envelope = {
      v: ENCRYPTED_REPORT_VERSION_V2,
      encrypted: "not-hex!!",
      meta: META,
    } as const;
    expect(() => decryptReportV2(envelope, PASSPHRASE)).toThrow(/not valid hex/);
  });
});

describe("cross-app compatibility with t3rminal", () => {
  // The load-bearing check: an envelope produced by t3rminal's literal
  // algorithm (sha256 "t3rminal-manual-key:" derivation, XChaCha20-Poly1305,
  // NO scheme field, meta carrying keyFingerprint) must decode + decrypt here.
  const nonce = new Uint8Array(24).fill(9);
  const envelope = t3rminalProducedEnvelope(SAMPLE_REPORT_JSON, PASSPHRASE, nonce);

  it("decodes a t3rminal-produced envelope as v2 and decrypts the exact plaintext", () => {
    const decoded = decodeEncryptedReportEnvelope(envelope);
    expect(decoded.kind).toBe("v2");
    if (decoded.kind === "v2") {
      expect(decryptReportV2(decoded.envelope, PASSPHRASE)).toBe(SAMPLE_REPORT_JSON);
    }
  });

  it("agrees with the producer on the key fingerprint", () => {
    expect(keyFingerprint(passphraseToKey(PASSPHRASE))).toBe(envelope.meta.keyFingerprint);
  });
});

describe("passcode unlock path", () => {
  // Models the exact admin unlock: candidate list is [derived-wire-password, raw-passcode].
  const PASSCODE = "hunter2 passcode";
  const wirePassword = deriveReportPasswordFromPasscode(PASSCODE);
  const envelope = t3rminalProducedEnvelope(SAMPLE_REPORT_JSON, wirePassword, new Uint8Array(24).fill(5));

  it("decrypts with the derived-wire-password candidate (QR flow)", () => {
    const candidates = [deriveReportPasswordFromPasscode(PASSCODE), PASSCODE];
    expect(tryCandidates(envelope, candidates)).toBe(SAMPLE_REPORT_JSON);
  });

  it("returns null when no candidate matches", () => {
    expect(tryCandidates(envelope, ["wrong", "also-wrong"])).toBeNull();
  });
});
