/**
 * Round-trip + envelope-shape tests for the v2 encrypted-report
 * machinery. Pins both the encoder, the defensive decoder, the
 * decryption helper, and the typed error classification.
 *
 * The producer (`createPasswordSeed` in `data/t3rminal-config-qr.ts`)
 * generates `password = base64url(sha256(...))` — 32 random bytes
 * base64url-encoded with `=` stripped. We exercise the full chain
 * with a real password seed so the test catches any byte-level drift
 * between the QR producer and the admin consumer.
 */

import { describe, expect, it } from "vitest";

import {
  base64UrlDecode,
  decodeEncryptedReportEnvelope,
  decryptReportV2,
  DecryptReportError,
  ENCRYPTED_REPORT_SCHEME_V1,
  ENCRYPTED_REPORT_VERSION_V2,
  encryptReportV2,
  hexToBytes,
  passwordToKey,
  REPORT_KEY_BYTES,
  type EncryptedReportMeta,
} from "@features/reports/encrypted-report.ts";
import { createPasswordSeed } from "@shared/lib/t3rminal-config-qr.ts";

// ── Fixtures ────────────────────────────────────────────────────

const PUBKEY = new Uint8Array(32).fill(7);

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

// ── base64url + hex helpers ─────────────────────────────────────

describe("base64UrlDecode", () => {
  it("round-trips a known producer-shaped password", () => {
    // 32 bytes of 0xAB → base64url("qqqq..." length 43, no padding).
    const seed = new Uint8Array(REPORT_KEY_BYTES).fill(0xab);
    const password =
      // pre-computed: base64url of 32 × 0xAB
      "q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s";
    const decoded = base64UrlDecode(password);
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(REPORT_KEY_BYTES);
    expect(Array.from(decoded!)).toEqual(Array.from(seed));
  });

  it("returns null on invalid base64url input", () => {
    expect(base64UrlDecode("not-base64!@#$%^")).toBeNull();
  });
});

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

describe("passwordToKey", () => {
  it("decodes a real producer-issued password to a 32-byte key", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const key = passwordToKey(password);
    expect(key.length).toBe(REPORT_KEY_BYTES);
  });

  it("throws badPassword when input isn't base64url", () => {
    expect(() => passwordToKey("not-valid-base64@@@@")).toThrow(DecryptReportError);
    try {
      passwordToKey("not-valid-base64@@@@");
    } catch (caught) {
      expect((caught as DecryptReportError).code).toBe("badPassword");
    }
  });

  it("throws badPassword when input decodes to wrong length", () => {
    // Decodes to 3 bytes — definitely not 32.
    expect(() => passwordToKey("AQID")).toThrow(/decodes to 3 bytes/);
  });
});

// ── Decoder ─────────────────────────────────────────────────────

describe("decodeEncryptedReportEnvelope", () => {
  it("accepts a well-formed v2 envelope", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, password, META);
    const decoded = decodeEncryptedReportEnvelope(envelope);
    expect(decoded.kind).toBe("v2");
    if (decoded.kind === "v2") {
      expect(decoded.envelope.v).toBe(ENCRYPTED_REPORT_VERSION_V2);
      expect(decoded.envelope.scheme).toBe(ENCRYPTED_REPORT_SCHEME_V1);
      expect(decoded.envelope.meta).toEqual(META);
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

  it("rejects a v2 envelope with the wrong scheme as invalid (not legacy)", () => {
    const decoded = decodeEncryptedReportEnvelope({
      v: 2,
      scheme: "future-aes-gcm-v3",
      encrypted: "deadbeef",
      meta: META,
    });
    expect(decoded.kind).toBe("invalid");
    if (decoded.kind === "invalid") {
      expect(decoded.reason).toMatch(/unknown v2 scheme/);
    }
  });

  it("rejects a v2 envelope missing encrypted as invalid", () => {
    const decoded = decodeEncryptedReportEnvelope({
      v: 2,
      scheme: ENCRYPTED_REPORT_SCHEME_V1,
      meta: META,
    });
    expect(decoded.kind).toBe("invalid");
  });

  it("rejects a v2 envelope missing meta as invalid", () => {
    const decoded = decodeEncryptedReportEnvelope({
      v: 2,
      scheme: ENCRYPTED_REPORT_SCHEME_V1,
      encrypted: "deadbeef",
    });
    expect(decoded.kind).toBe("invalid");
  });

  it("rejects null / non-object inputs", () => {
    expect(decodeEncryptedReportEnvelope(null).kind).toBe("invalid");
    expect(decodeEncryptedReportEnvelope("hello").kind).toBe("invalid");
    expect(decodeEncryptedReportEnvelope(42).kind).toBe("invalid");
  });

  it("rejects a future v3 envelope as invalid (forward compat is a separate decision)", () => {
    const decoded = decodeEncryptedReportEnvelope({
      v: 3,
      scheme: ENCRYPTED_REPORT_SCHEME_V1,
      encrypted: "deadbeef",
      meta: META,
    });
    expect(decoded.kind).toBe("invalid");
    if (decoded.kind === "invalid") {
      expect(decoded.reason).toMatch(/unrecognised envelope version/);
    }
  });
});

// ── Encrypt → decrypt round-trip ─────────────────────────────────

describe("encryptReportV2 + decryptReportV2", () => {
  it("round-trips the report verbatim", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, password, META);
    const decrypted = decryptReportV2(envelope, password);
    expect(decrypted).toBe(SAMPLE_REPORT_JSON);
  });

  it("uses a unique random nonce when none is supplied", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const a = encryptReportV2(SAMPLE_REPORT_JSON, password, META);
    const b = encryptReportV2(SAMPLE_REPORT_JSON, password, META);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it("rejects decryption when the password is rotated", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const otherSeed = createPasswordSeed(PUBKEY); // fresh salt → different password
    const envelope = encryptReportV2(SAMPLE_REPORT_JSON, password, META);
    expect(() => decryptReportV2(envelope, otherSeed.password)).toThrow(DecryptReportError);
    try {
      decryptReportV2(envelope, otherSeed.password);
    } catch (caught) {
      expect((caught as DecryptReportError).code).toBe("authFailed");
    }
  });

  it("rejects malformed ciphertext (too short for the nonce)", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const envelope = {
      v: ENCRYPTED_REPORT_VERSION_V2,
      scheme: ENCRYPTED_REPORT_SCHEME_V1,
      encrypted: "deadbeef", // 4 bytes — less than nonce(24)
      meta: META,
    } as const;
    expect(() => decryptReportV2(envelope, password)).toThrow(/ciphertext shorter than nonce/);
  });

  it("rejects malformed ciphertext (non-hex)", () => {
    const { password } = createPasswordSeed(PUBKEY);
    const envelope = {
      v: ENCRYPTED_REPORT_VERSION_V2,
      scheme: ENCRYPTED_REPORT_SCHEME_V1,
      encrypted: "not-hex!!",
      meta: META,
    } as const;
    expect(() => decryptReportV2(envelope, password)).toThrow(/not valid hex/);
  });
});
