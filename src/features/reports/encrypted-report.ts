// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";

export const ENCRYPTED_REPORT_VERSION_V2 = 2 as const;

export const XCHACHA_NONCE_BYTES = 24;

export const REPORT_KEY_BYTES = 32;

export interface EncryptedReportEnvelopeV2 {
  readonly v: typeof ENCRYPTED_REPORT_VERSION_V2;
  /**
   * Hex-encoded `nonce(24) || ciphertext` produced by XChaCha20-Poly1305.
   * No `0x` prefix — matches the upstream producer's convention.
   */
  readonly encrypted: string;
  readonly meta: EncryptedReportMeta;
}

/**
 * Unencrypted metadata kept on the envelope so the admin Reports list can
 * render dates / counts without having to decrypt every payload up-front.
 * Anything sensitive belongs inside the ciphertext.
 */
export interface EncryptedReportMeta {
  /** `YYYY-MM-DD`, same form the terminal stores on chain. */
  readonly date: string;
  readonly txCount: number;
  /**
   * Short identifier for the source terminal. Today the producer uses a
   * truncated merchant address; we never blindly trust it for routing.
   */
  readonly terminal: string;
  /** ISO timestamp at which the envelope was produced. */
  readonly encryptedAt: string;
  /**
   * Short fingerprint (8 uppercase hex) of the key that encrypted this
   * report. Written by t3rminal; absent on older envelopes. Lets the panel
   * show which passcode era a report belongs to.
   */
  readonly keyFingerprint?: string;
}

/**
 * Result of the defensive decoder. A producer mismatch (v1, future v3,
 * malformed payload) returns a typed variant rather than throwing so the
 * Reports UI can render a specific message per state.
 */
export type EncryptedReportEnvelope =
  | { readonly kind: "v2"; readonly envelope: EncryptedReportEnvelopeV2 }
  | { readonly kind: "legacy-v1"; readonly meta: EncryptedReportMeta | null }
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * Defensively interpret arbitrary JSON-decoded input as an envelope.
 *
 * Returns the discriminated union above. Never throws on shape problems;
 * the only throw paths are programmer errors (passing in literal
 * `undefined`, etc.) — those should be caught at the call site.
 */
export function decodeEncryptedReportEnvelope(raw: unknown): EncryptedReportEnvelope {
  if (raw === null || typeof raw !== "object") {
    return { kind: "invalid", reason: "payload is not an object" };
  }
  const r = raw as {
    readonly v?: unknown;
    readonly encrypted?: unknown;
    readonly meta?: unknown;
    readonly recipients?: unknown;
  };

  if (r.v === ENCRYPTED_REPORT_VERSION_V2) {
    if (typeof r.encrypted !== "string" || r.encrypted.length === 0) {
      return { kind: "invalid", reason: "missing or empty `encrypted` field" };
    }
    const meta = decodeMeta(r.meta);
    if (!meta) {
      return { kind: "invalid", reason: "missing or malformed `meta` field" };
    }
    return {
      kind: "v2",
      envelope: {
        v: ENCRYPTED_REPORT_VERSION_V2,
        encrypted: r.encrypted,
        meta,
      },
    };
  }

  // The upstream producer's pre-existing envelope: `{ v: 1, encrypted, recipients[], meta }`.
  // We can identify it but cannot decrypt without the recipient's X25519
  // secret key. Surface meta when present so the UI can still show date /
  // tx-count.
  if (r.v === 1 && Array.isArray(r.recipients)) {
    return { kind: "legacy-v1", meta: decodeMeta(r.meta) };
  }

  return { kind: "invalid", reason: `unrecognised envelope version: ${String(r.v)}` };
}

function decodeMeta(raw: unknown): EncryptedReportMeta | null {
  if (raw === null || typeof raw !== "object") return null;
  const m = raw as {
    readonly date?: unknown;
    readonly txCount?: unknown;
    readonly terminal?: unknown;
    readonly encryptedAt?: unknown;
    readonly keyFingerprint?: unknown;
  };
  if (
    typeof m.date !== "string" ||
    typeof m.txCount !== "number" ||
    typeof m.terminal !== "string" ||
    typeof m.encryptedAt !== "string"
  ) {
    return null;
  }
  return {
    date: m.date,
    txCount: m.txCount,
    terminal: m.terminal,
    encryptedAt: m.encryptedAt,
    ...(typeof m.keyFingerprint === "string" ? { keyFingerprint: m.keyFingerprint } : {}),
  };
}

export class DecryptReportError extends Error {
  constructor(
    public readonly code: DecryptReportErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DecryptReportError";
  }
}

export type DecryptReportErrorCode =
  /** Ciphertext is shorter than the nonce, or hex couldn't be parsed. */
  | "malformedCiphertext"
  /** XChaCha20-Poly1305 rejected the tag — wrong key or tampering. */
  | "authFailed";

/**
 * Decrypt the v2 envelope's `encrypted` field with the QR-shared password.
 *
 * Returns the raw plaintext JSON string. The caller is responsible for
 * `JSON.parse` + shape validation against `DailyReport`.
 */
export function decryptReportV2(
  envelope: EncryptedReportEnvelopeV2,
  passphrase: string,
): string {
  const key = passphraseToKey(passphrase);
  const packed = hexToBytes(envelope.encrypted);
  if (packed === null) {
    throw new DecryptReportError(
      "malformedCiphertext",
      "encrypted field is not valid hex",
    );
  }
  if (packed.length <= XCHACHA_NONCE_BYTES) {
    throw new DecryptReportError(
      "malformedCiphertext",
      `ciphertext shorter than nonce (${packed.length} <= ${XCHACHA_NONCE_BYTES})`,
    );
  }
  const nonce = packed.subarray(0, XCHACHA_NONCE_BYTES);
  const ct = packed.subarray(XCHACHA_NONCE_BYTES);
  let plain: Uint8Array;
  try {
    plain = xchacha20poly1305(key, nonce).decrypt(ct);
  } catch (caught) {
    throw new DecryptReportError(
      "authFailed",
      "decryption failed: wrong password or corrupted payload",
      caught,
    );
  } finally {
    // Zero the local key copy. The underlying buffer behind the password
    // is short-lived (passed as a string), so this is best-effort only.
    key.fill(0);
  }
  return new TextDecoder().decode(plain);
}

/**
 * Encrypt a plaintext JSON string into a v2 envelope. Lives here so the
 * vitest round-trip can exercise the exact pair of functions the
 * production path uses; the actual encryption side runs on the T3rminal
 * device, not in this app.
 *
 * `nonce` is optional — production callers omit it and let the helper
 * mint a random 24-byte nonce. Tests pin it for determinism.
 */
export function encryptReportV2(
  plaintext: string,
  passphrase: string,
  meta: EncryptedReportMeta,
  nonce: Uint8Array = randomBytes(XCHACHA_NONCE_BYTES),
): EncryptedReportEnvelopeV2 {
  if (nonce.length !== XCHACHA_NONCE_BYTES) {
    throw new DecryptReportError(
      "malformedCiphertext",
      `nonce must be ${XCHACHA_NONCE_BYTES} bytes, got ${nonce.length}`,
    );
  }
  const key = passphraseToKey(passphrase);
  let ct: Uint8Array;
  try {
    ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(plaintext));
  } finally {
    key.fill(0);
  }
  const packed = new Uint8Array(nonce.length + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, nonce.length);
  return {
    v: ENCRYPTED_REPORT_VERSION_V2,
    encrypted: bytesToHex(packed),
    meta,
  };
}

export const REPORT_PASSPHRASE_KEY_DOMAIN = "t3rminal-manual-key:" as const;

/**
 * Derive the 32-byte symmetric key from the report passphrase.
 *
 * Mirrors `t3rminal/lib/crypto/manual-key.ts` `deriveKeyFromPassphrase`
 * byte-for-byte: `sha256(utf8("t3rminal-manual-key:" + passphrase.trim()))`.
 * The passphrase is the QR-wire `reportPassword` (derived from the admin
 * passcode) for QR-flow terminals, or a phrase the merchant typed directly
 * on the terminal's encryption settings.
 */
export function passphraseToKey(passphrase: string): Uint8Array {
  return sha256(new TextEncoder().encode(`${REPORT_PASSPHRASE_KEY_DOMAIN}${passphrase.trim()}`));
}

/**
 * Short, human-readable fingerprint of a derived key (first 8 hex chars of
 * sha256 over the key, uppercase). Matches the fingerprint t3rminal shows
 * under Settings → Report Encryption so an operator can tell passcode eras
 * apart.
 */
export function keyFingerprint(key: Uint8Array): string {
  return bytesToHex(sha256(key)).slice(0, 8).toUpperCase();
}

/**
 * Hex → bytes, tolerant of an optional `0x` prefix. Returns `null` on
 * malformed input.
 */
export function hexToBytes(hex: string): Uint8Array | null {
  if (typeof hex !== "string") return null;
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
import type { DailyReport } from "./daily-report.ts";

export interface UseDecryptedReportArgs {
  /** Bulletin CID. `null` keeps the hook idle. */
  readonly cid: string | null;
  /** Candidate passphrases (derived wire password and/or raw passcode), tried in order. */
  readonly passwords: ReadonlyArray<string>;
  /** Bumped on each explicit unlock so a corrected passcode refetches. */
  readonly unlockNonce: number;
  /** IPFS gateway base URL — pass from `resolveNetwork(...).ipfsGateway`. */
  readonly gatewayBase: string;
}

export type DecryptedReportState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly report: DailyReport;
      readonly meta: EncryptedReportMeta;
      readonly refresh: () => void;
    }
  | {
      readonly kind: "legacy-v1";
      readonly meta: EncryptedReportMeta | null;
      readonly refresh: () => void;
    }
  | {
      readonly kind: "corrupt";
      readonly reason: string;
      readonly refresh: () => void;
    }
  | {
      readonly kind: "decrypt-error";
      readonly reason: string;
      readonly meta: EncryptedReportMeta;
      readonly refresh: () => void;
    }
  | {
      readonly kind: "parse-error";
      readonly refresh: () => void;
    }
  | {
      readonly kind: "fetch-error";
      readonly reason: string;
      readonly refresh: () => void;
    };
