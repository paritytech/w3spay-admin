// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * Structure-validating P-256 EC private-key PEM parser.
 *
 * VENDORED from `w3s-payment-processor/src/shared/utils/wire/pem.ts`, trimmed to
 * the DER-structure + curve-OID validation the admin needs to reject a bad
 * `pemFile` at publish time. The processor's copy additionally derives the
 * public point via `@noble/curves`; the admin only needs to confirm the PEM is
 * a well-formed SEC1/PKCS#8 P-256 private key, so it returns just the 32-byte
 * scalar and avoids pulling `@noble/curves` into this package.
 *
 * The two MUST agree on what they accept (so a config the admin publishes
 * unlocks on the processor); the only gap is a structurally-valid PEM whose
 * scalar is out of the group order — that final check stays on the processor
 * and never arises for keys produced by openssl/standard tooling.
 */
export class PemError extends Error {
  override readonly name = "PemError";
}

// DER tags.
const SEQUENCE = 0x30;
const INTEGER = 0x02;
const OCTET_STRING = 0x04;
const OID = 0x06;
const CONTEXT_0 = 0xa0; // [0] EXPLICIT — EC parameters in SEC1
const CONTEXT_1 = 0xa1; // [1] EXPLICIT — embedded publicKey BIT STRING in SEC1
const BIT_STRING = 0x03;

// OID content bytes (after tag+len), lowercase hex.
const EC_PUBLIC_KEY_OID = "2a8648ce3d0201"; // 1.2.840.10045.2.1  id-ecPublicKey
const P256_CURVE_OID = "2a8648ce3d030107"; // 1.2.840.10045.3.1.7  prime256v1

interface Tlv {
  tag: number;
  contentStart: number;
  contentEnd: number;
  end: number;
}

function readTlv(der: Uint8Array, offset: number): Tlv {
  if (offset + 2 > der.length) throw new PemError("DER truncated reading tag/length");
  const tag = der[offset]!;
  let len = der[offset + 1]!;
  let cursor = offset + 2;
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    if (numBytes === 0 || numBytes > 4) throw new PemError("DER unsupported length encoding");
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      if (cursor >= der.length) throw new PemError("DER truncated reading long length");
      len = (len << 8) | der[cursor]!;
      cursor++;
    }
  }
  const contentEnd = cursor + len;
  if (contentEnd > der.length) throw new PemError("DER truncated reading content");
  return { tag, contentStart: cursor, contentEnd, end: contentEnd };
}

function pemToDer(pem: string): { label: string; der: Uint8Array } {
  const match = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!match) throw new PemError("not a PEM block (missing BEGIN/END markers)");
  const label = match[1]!.trim();
  const b64 = match[2]!.replace(/\s+/g, "");
  let binary: string;
  try {
    binary = atob(b64);
  } catch (cause) {
    throw new PemError("PEM body is not valid base64", { cause });
  }
  return { label, der: Uint8Array.from(binary, (ch) => ch.charCodeAt(0)) };
}

/** Pad/trim an EC private scalar to exactly 32 bytes (P-256 field width). */
function normalizeScalar(raw: Uint8Array): Uint8Array {
  if (raw.length === 32) return raw;
  if (raw.length < 32) {
    const out = new Uint8Array(32);
    out.set(raw, 32 - raw.length);
    return out;
  }
  let start = 0;
  while (start < raw.length - 32 && raw[start] === 0) start++;
  if (raw.length - start !== 32) {
    throw new PemError(`EC private scalar must be 32 bytes (got ${raw.length})`);
  }
  return raw.subarray(start);
}

interface Sec1Parts {
  readonly scalar: Uint8Array;
  /** SEC1 point from the optional `[1]` publicKey BIT STRING — 65-byte uncompressed or 33-byte compressed — or null when the PEM omits it. */
  readonly publicPoint: Uint8Array | null;
}

/**
 * SEC1 `ECPrivateKey ::= SEQUENCE { version INTEGER, privateKey OCTET STRING,
 * [0] parameters OPTIONAL, [1] publicKey OPTIONAL }`. Verifies the curve OID
 * when the optional `[0]` parameters carry it, and captures the optional `[1]`
 * embedded public point (WebCrypto and openssl exports both include it).
 */
function parseSec1(der: Uint8Array): Sec1Parts {
  const seq = readTlv(der, 0);
  if (seq.tag !== SEQUENCE) throw new PemError("SEC1: expected outer SEQUENCE");
  const version = readTlv(der, seq.contentStart);
  if (version.tag !== INTEGER) throw new PemError("SEC1: expected version INTEGER");
  const privateKey = readTlv(der, version.end);
  if (privateKey.tag !== OCTET_STRING) throw new PemError("SEC1: expected privateKey OCTET STRING");
  const scalar = normalizeScalar(der.subarray(privateKey.contentStart, privateKey.contentEnd));

  let publicPoint: Uint8Array | null = null;
  let offset = privateKey.end;
  while (offset < seq.contentEnd) {
    const field = readTlv(der, offset);
    if (field.tag === CONTEXT_0) {
      const inner = readTlv(der, field.contentStart);
      if (inner.tag === OID) {
        const hex = bytesToHex(der.subarray(inner.contentStart, inner.contentEnd));
        if (hex !== P256_CURVE_OID) {
          throw new PemError(`unsupported curve OID ${hex} (expected P-256 prime256v1)`);
        }
      }
    }
    if (field.tag === CONTEXT_1) {
      const inner = readTlv(der, field.contentStart);
      // BIT STRING content = one unused-bits byte (0) followed by the point.
      if (inner.tag === BIT_STRING && inner.contentEnd - inner.contentStart > 1) {
        publicPoint = der.subarray(inner.contentStart + 1, inner.contentEnd);
      }
    }
    offset = field.end;
  }
  return { scalar, publicPoint };
}

/**
 * PKCS#8 `PrivateKeyInfo ::= SEQUENCE { version INTEGER, algorithm
 * AlgorithmIdentifier { id-ecPublicKey, namedCurve }, privateKey OCTET STRING
 * (a DER-encoded SEC1 ECPrivateKey) }`.
 */
function parsePkcs8(der: Uint8Array): Sec1Parts {
  const seq = readTlv(der, 0);
  if (seq.tag !== SEQUENCE) throw new PemError("PKCS#8: expected outer SEQUENCE");
  const version = readTlv(der, seq.contentStart);
  if (version.tag !== INTEGER) throw new PemError("PKCS#8: expected version INTEGER");
  const algId = readTlv(der, version.end);
  if (algId.tag !== SEQUENCE) throw new PemError("PKCS#8: expected AlgorithmIdentifier SEQUENCE");

  const algOid = readTlv(der, algId.contentStart);
  if (algOid.tag !== OID || bytesToHex(der.subarray(algOid.contentStart, algOid.contentEnd)) !== EC_PUBLIC_KEY_OID) {
    throw new PemError("PKCS#8: algorithm is not id-ecPublicKey");
  }
  const curveOid = readTlv(der, algOid.end);
  if (curveOid.tag !== OID || bytesToHex(der.subarray(curveOid.contentStart, curveOid.contentEnd)) !== P256_CURVE_OID) {
    throw new PemError("PKCS#8: unsupported curve (expected P-256 prime256v1)");
  }

  const pkInfo = readTlv(der, algId.end);
  if (pkInfo.tag !== OCTET_STRING) throw new PemError("PKCS#8: expected privateKey OCTET STRING");
  return parseSec1(der.subarray(pkInfo.contentStart, pkInfo.contentEnd));
}

function parseParts(pem: string): Sec1Parts {
  const { label, der } = pemToDer(pem);
  if (label === "EC PRIVATE KEY") return parseSec1(der);
  if (label === "PRIVATE KEY") return parsePkcs8(der);
  throw new PemError(
    `unsupported PEM label "${label}" (expected "EC PRIVATE KEY" or "PRIVATE KEY")`,
  );
}

/**
 * Parse + validate a P-256 EC private key PEM (SEC1 "EC PRIVATE KEY" or PKCS#8
 * "PRIVATE KEY"), returning the 32-byte private scalar. Throws `PemError` on a
 * non-PEM string, malformed DER, wrong key type, or non-P-256 curve.
 */
export function parseP256PrivateKeyPem(pem: string): Uint8Array {
  return parseParts(pem).scalar;
}

/**
 * Extract the terminal's PUBLIC key from a P-256 private-key PEM as a 33-byte
 * SEC1 compressed point (`02`/`03` parity prefix + X). This is the `key` a
 * payer app encrypts to — PUBLIC material, safe to distribute via the payer
 * app's remote config, unlike the private scalar which must stay inside the
 * encrypted bundle.
 *
 * Reads the `[1]` publicKey BIT STRING embedded in the SEC1 body (present in
 * WebCrypto and openssl exports) and compresses it by Y-parity — pure byte
 * work, no curve math. Throws `PemError` when the PEM omits the public point.
 */
export function extractP256CompressedPublicKey(pem: string): Uint8Array {
  const point = parseParts(pem).publicPoint;
  if (point == null) {
    throw new PemError("PEM does not embed a public key — re-export it with the public point included");
  }
  if (point.length === 33 && (point[0] === 0x02 || point[0] === 0x03)) {
    return new Uint8Array(point);
  }
  if (point.length === 65 && point[0] === 0x04) {
    const compressed = new Uint8Array(33);
    compressed[0] = (point[64]! & 1) === 1 ? 0x03 : 0x02;
    compressed.set(point.subarray(1, 33), 1);
    return compressed;
  }
  throw new PemError(`embedded public key has unexpected shape (${point.length} bytes, prefix 0x${point[0]?.toString(16) ?? "?"})`);
}
