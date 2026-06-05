/**
 * T3rminal configuration QR payload + report-password derivation.
 *
 * The W3sPay admin emits a single QR that a T3rminal device scans
 * once to bind itself to a merchant + item config. The v2 wire form
 * is a BCTS Uniform Resource (`ur:t3rminal-config/<bytewords>`)
 * carrying deterministic CBOR with the *full* item config body
 * embedded, so terminals can boot a catalog without dereferencing
 * `itemConfigCid` from Bulletin. Legacy v1 was a minified JSON
 * pointer payload — kept here as exported types/helpers so older
 * scanners and the assignment storage layer can still parse stored
 * records, but no new QR codes ship in v1.
 *
 * Password derivation is a v1, intentionally lightweight construction
 * versioned via `passwordScheme` so it can rotate without breaking the
 * payload schema:
 *
 *   reportPassword = sha256(
 *     "w3spay:t3rminal-report-password:v1" || adminProductPublicKey || salt
 *   )
 *
 * The 32-byte digest is base64url-encoded for transport. The salt is
 * persisted alongside the assignment so the same password can be
 * recomputed for diagnostics; regenerating the password rotates the
 * salt and produces a fresh digest.
 */

import { sha256 } from "@noble/hashes/sha2.js";

import {
  T3RMINAL_CONFIG_QR_UR_TYPE,
  T3RMINAL_CONFIG_QR_VERSION_V1,
  T3RMINAL_CONFIG_QR_VERSION_V2,
  T3RMINAL_REPORT_PASSWORD_SCHEME_V1 as SHARED_REPORT_PASSWORD_SCHEME_V1,
  buildT3rminalConfigQrV2 as sharedBuildT3rminalConfigQrV2,
  encodeT3rminalConfigQrV2 as sharedEncodeT3rminalConfigQrV2,
  type AdminItemConfigQrConfig,
  type MerchantProfile,
  type EncodedT3rminalConfigQrV2,
  type T3rminalConfigQrPayloadV1 as SharedT3rminalConfigQrPayloadV1,
  type T3rminalConfigQrPayloadV2 as SharedT3rminalConfigQrPayloadV2,
} from "@/shared/config-qr";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

export const T3RMINAL_QR_TYPE = T3RMINAL_CONFIG_QR_UR_TYPE;
export const T3RMINAL_QR_VERSION = T3RMINAL_CONFIG_QR_VERSION_V1;
export const T3RMINAL_QR_VERSION_V2 = T3RMINAL_CONFIG_QR_VERSION_V2;
export const T3RMINAL_REPORT_PASSWORD_SCHEME_V1 = SHARED_REPORT_PASSWORD_SCHEME_V1;

/** Domain separator for v1 report-password derivation. */
export const T3RMINAL_REPORT_PASSWORD_DOMAIN_V1 = "w3spay:t3rminal-report-password:v1" as const;

/** Length in bytes of the random salt that feeds into v1 password derivation. */
export const T3RMINAL_PASSWORD_SALT_BYTES = 16;

/**
 * Conservative ceiling for the v1 JSON QR payload, in bytes. Only the
 * legacy v1 encoder still uses this guard — v2 routes through the
 * BCTS density check (`DEFAULT_MAX_MODULES`) instead.
 */
export const T3RMINAL_QR_PAYLOAD_BYTE_LIMIT = 2048;

export type T3rminalConfigQRPayloadV1 = SharedT3rminalConfigQrPayloadV1;
export type T3rminalConfigQRPayloadV2 = SharedT3rminalConfigQrPayloadV2;

export interface BuildT3rminalConfigPayloadArgs {
  readonly merchant: AdminMerchant;
  readonly itemConfigId: string;
  readonly itemConfigCid: string;
  readonly reportPassword: string;
  readonly registryAddress: string;
  readonly issuedAt: string;
}

/**
 * Build the legacy v1 QR payload object from the resolved building
 * blocks. Retained so the assignment storage layer and tests can
 * still construct/inspect the historical pointer-only payload shape.
 */
export function buildT3rminalConfigPayload(
  args: BuildT3rminalConfigPayloadArgs,
): T3rminalConfigQRPayloadV1 {
  return {
    v: T3RMINAL_CONFIG_QR_VERSION_V1,
    type: T3RMINAL_CONFIG_QR_UR_TYPE,
    merchantKey: args.merchant.key,
    merchantId: args.merchant.merchantId,
    terminalId: args.merchant.terminalId,
    displayName: args.merchant.displayName,
    receivingAddress: args.merchant.destinationSs58,
    passwordScheme: T3RMINAL_REPORT_PASSWORD_SCHEME_V1,
    reportPassword: args.reportPassword,
    itemConfigId: args.itemConfigId,
    itemConfigCid: args.itemConfigCid,
    registryAddress: args.registryAddress,
    issuedAt: args.issuedAt,
  };
}

/**
 * Minified JSON encoding of the legacy v1 payload. Kept for tests and
 * any operator tooling that still needs to inspect the JSON wire form
 * — production QR generation uses {@link encodeT3rminalConfigPayloadV2}.
 */
export function encodeT3rminalConfigPayload(payload: T3rminalConfigQRPayloadV1): string {
  const json = JSON.stringify(payload);
  const size = TEXT_ENCODER.encode(json).length;
  if (size > T3RMINAL_QR_PAYLOAD_BYTE_LIMIT) {
    throw new Error(
      `T3rminal QR payload too large (${size} bytes; limit ${T3RMINAL_QR_PAYLOAD_BYTE_LIMIT}).`,
    );
  }
  return json;
}

// ── v2 (UR + dCBOR) builder/encoder ─────────────────────────────────

export interface BuildT3rminalConfigPayloadV2Args {
  readonly merchant: AdminMerchant;
  readonly config: ItemConfig;
  readonly reportPassword: string;
  readonly issuedAt: string;
  readonly profile?: MerchantProfile;
}

/**
 * Build the v2 QR payload that carries the full item config body
 * inline. The terminal scans this once and never needs to fetch the
 * item config from Bulletin.
 */
export function buildT3rminalConfigPayloadV2(
  args: BuildT3rminalConfigPayloadV2Args,
): T3rminalConfigQRPayloadV2 {
  const adminConfig: AdminItemConfigQrConfig = {
    id: args.config.id,
    name: args.config.name,
    updatedAt: args.config.updatedAt,
    items: args.config.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
    })),
  };
  return sharedBuildT3rminalConfigQrV2({
    merchantKey: args.merchant.key,
    merchantId: args.merchant.merchantId,
    terminalId: args.merchant.terminalId,
    displayName: args.merchant.displayName,
    receivingAddress: args.merchant.destinationSs58,
    reportPassword: args.reportPassword,
    issuedAt: args.issuedAt,
    config: adminConfig,
    profile: args.profile,
  });
}

/**
 * Encode the v2 payload as a BCTS UR. The returned `qrString` is the
 * uppercase UR form intended for QR rendering; `byteLength` is the
 * UTF-8 byte count of that string and is the only thing the BCTS
 * density check cares about.
 */
export function encodeT3rminalConfigPayloadV2(
  payload: T3rminalConfigQRPayloadV2,
): EncodedT3rminalConfigQrV2 {
  return sharedEncodeT3rminalConfigQrV2(payload);
}

// ── Password derivation ─────────────────────────────────────────────

export interface PasswordSeed {
  readonly salt: Uint8Array;
  readonly password: string;
}

/**
 * Generate a fresh random salt + derive the v1 report password from
 * `publicKey`. The returned salt should be persisted locally so the
 * derivation is reproducible for diagnostics; rotating the salt rotates
 * the password.
 */
export function createPasswordSeed(publicKey: Uint8Array): PasswordSeed {
  const salt = new Uint8Array(T3RMINAL_PASSWORD_SALT_BYTES);
  cryptoSource().getRandomValues(salt);
  return { salt, password: deriveReportPassword(publicKey, salt) };
}

/**
 * Derive the v1 report password from a product-account public key and
 * a 16-byte random salt. Deterministic in its inputs.
 *
 * Returns the base64url encoding of the 32-byte digest — the wire form
 * consumed by T3rminal devices.
 */
export function deriveReportPassword(publicKey: Uint8Array, salt: Uint8Array): string {
  if (publicKey.length === 0) throw new Error("publicKey is empty");
  if (salt.length === 0) throw new Error("salt is empty");
  const domain = TEXT_ENCODER.encode(T3RMINAL_REPORT_PASSWORD_DOMAIN_V1);
  const total = domain.length + publicKey.length + salt.length;
  const buffer = new Uint8Array(total);
  buffer.set(domain, 0);
  buffer.set(publicKey, domain.length);
  buffer.set(salt, domain.length + publicKey.length);
  const digest = sha256(buffer);
  return base64UrlEncode(digest);
}

/**
 * Base64url encode (RFC 4648 §5, no padding). No allocation beyond
 * one intermediate string + the result.
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TEXT_ENCODER = /* @__PURE__ */ new TextEncoder();

function cryptoSource(): Crypto {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    return crypto;
  }
  throw new Error("`crypto.getRandomValues` is not available in this runtime.");
}
