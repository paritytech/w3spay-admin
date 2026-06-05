/**
 * Encrypted daily-report envelope (v2) emitted by future T3rminal builds and
 * consumed by the W3sPay admin Reports surface.
 *
 * Encryption is XChaCha20-Poly1305 keyed by the QR-shared `reportPassword`.
 * The QR password is a base64url-encoded 32-byte sha256 digest minted by
 * `createPasswordSeed` in `t3rminal-config-qr.ts` and persisted on both
 * sides — admin in `T3rminalAssignmentV1.reportPassword`, terminal in the
 * payload it scanned. Same secret on both ends, no per-recipient wrapping.
 *
 * Compatibility:
 *   - v2 (`{ v: 2, scheme: "qr-password-xchacha20-v1", ... }`): decrypted
 *     here. The current scheme.
 *   - v1 (T3rminal's pre-existing X25519 sealed-box envelopes): detected,
 *     surfaced to the UI as "legacy-v1, admin cannot decrypt". This stops
 *     the Reports screen from masquerading a recognised-but-undecryptable
 *     payload as corruption.
 *   - Anything else: `invalid`. The decoder is intentionally strict so a
 *     future v3 isn't silently misclassified as v2.
 *
 * Nothing in this module touches the network or chain — it's a pure
 * encode/decode + symmetric-crypto helper. Wire it through
 * `bulletin/fetch-report.ts` for the fetch side and through
 * `hooks/use-decrypted-report.ts` for the React-state machine.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/hashes/utils.js";

// ── Constants ───────────────────────────────────────────────────────

/** v2 envelope schema marker. v3 would bump this. */
export const ENCRYPTED_REPORT_VERSION_V2 = 2 as const;

/**
 * Identifier baked into every v2 envelope. Different `scheme` values can
 * coexist under `v: 2` if we ever introduce a second symmetric algorithm.
 * Today there is only one.
 */
export const ENCRYPTED_REPORT_SCHEME_V1 = "qr-password-xchacha20-v1" as const;

/** XChaCha20-Poly1305 nonce length. */
export const XCHACHA_NONCE_BYTES = 24;

/** Required key length for the symmetric scheme. */
export const REPORT_KEY_BYTES = 32;

// ── Envelope types ──────────────────────────────────────────────────

export interface EncryptedReportEnvelopeV2 {
  readonly v: typeof ENCRYPTED_REPORT_VERSION_V2;
  readonly scheme: typeof ENCRYPTED_REPORT_SCHEME_V1;
  /**
   * Hex-encoded `nonce(24) || ciphertext` produced by XChaCha20-Poly1305.
   * No `0x` prefix — matches the t3rminal-v1 producer's convention.
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
  /** Number of transactions in the report — pure display aid. */
  readonly txCount: number;
  /**
   * Short identifier for the source terminal. Today the producer uses a
   * truncated merchant address; we never blindly trust it for routing.
   */
  readonly terminal: string;
  /** ISO timestamp at which the envelope was produced. */
  readonly encryptedAt: string;
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

// ── Decoder ────────────────────────────────────────────────────────

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
    readonly scheme?: unknown;
    readonly encrypted?: unknown;
    readonly meta?: unknown;
    readonly recipients?: unknown;
  };

  if (r.v === ENCRYPTED_REPORT_VERSION_V2) {
    if (r.scheme !== ENCRYPTED_REPORT_SCHEME_V1) {
      return {
        kind: "invalid",
        reason: `unknown v2 scheme: ${String(r.scheme)}`,
      };
    }
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
        scheme: ENCRYPTED_REPORT_SCHEME_V1,
        encrypted: r.encrypted,
        meta,
      },
    };
  }

  // T3rminal-v1 pre-existing envelope: `{ v: 1, encrypted, recipients[], meta }`.
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
  };
}

// ── Decrypt / encrypt ───────────────────────────────────────────────

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
  /** `reportPassword` did not decode to a 32-byte key. */
  | "badPassword"
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
  reportPassword: string,
): string {
  const key = passwordToKey(reportPassword);
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
  reportPassword: string,
  meta: EncryptedReportMeta,
  nonce: Uint8Array = randomBytes(XCHACHA_NONCE_BYTES),
): EncryptedReportEnvelopeV2 {
  if (nonce.length !== XCHACHA_NONCE_BYTES) {
    throw new DecryptReportError(
      "malformedCiphertext",
      `nonce must be ${XCHACHA_NONCE_BYTES} bytes, got ${nonce.length}`,
    );
  }
  const key = passwordToKey(reportPassword);
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
    scheme: ENCRYPTED_REPORT_SCHEME_V1,
    encrypted: bytesToHex(packed),
    meta,
  };
}

// ── Password / key derivation ──────────────────────────────────────

/**
 * Convert the QR-shared `reportPassword` string into a 32-byte symmetric
 * key.
 *
 * The producer (`createPasswordSeed` in `t3rminal-config-qr.ts`) generates
 * `password = base64url(sha256(...))` — 32 raw random bytes encoded with
 * the unpadded base64url alphabet. We reverse that here.
 *
 * Wrong-length results are rejected with a typed error so the caller can
 * branch on `code === "badPassword"` instead of inspecting messages.
 */
export function passwordToKey(reportPassword: string): Uint8Array {
  const decoded = base64UrlDecode(reportPassword);
  if (decoded === null) {
    throw new DecryptReportError(
      "badPassword",
      "reportPassword is not valid base64url",
    );
  }
  if (decoded.length !== REPORT_KEY_BYTES) {
    throw new DecryptReportError(
      "badPassword",
      `reportPassword decodes to ${decoded.length} bytes; expected ${REPORT_KEY_BYTES}`,
    );
  }
  return decoded;
}

// ── Encoding helpers ───────────────────────────────────────────────

/**
 * Base64url decode (RFC 4648 §5, no padding). Mirrors the encoder in
 * `t3rminal-config-qr.ts`. Returns `null` on invalid input rather than
 * throwing so the `badPassword` classification stays clean.
 */
export function base64UrlDecode(value: string): Uint8Array | null {
  if (typeof value !== "string") return null;
  // Convert base64url → base64 by replacing chars and re-padding.
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    const binary = atob(padded + padding);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
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
  /** QR-shared report password from `T3rminalAssignmentV1`. */
  readonly reportPassword: string | null;
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
