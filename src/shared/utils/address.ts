import { ethers } from "ethers";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { fromBufferToBase58, getSs58AddressInfo } from "@polkadot-api/substrate-bindings";

export type AccountId32Hex = `0x${string}`;
export type H160Hex = `0x${string}`;

const ACCOUNT_ID32_RE = /^0x[0-9a-fA-F]{64}$/;
const LEFT_PADDED_H160_PREFIX = `0x${"00".repeat(12)}`;
const SS58_PREFIX_SUBSTRATE = 42;
const ACCOUNTID_BYTE_LEN = 32;
const H160_BYTE_LEN = 20;
/** pallet-revive sentinel for `Revive.map_account` derived accounts. */
const EVM_DERIVED_MARKER = 0xee;

export class InvalidAdminAddressError extends Error {
  constructor(value: string) {
    super(`admin address must be a 0x-prefixed H160; got ${value}`);
    this.name = "InvalidAdminAddressError";
  }
}

export class InvalidDestinationAccountError extends Error {
  constructor(value: string) {
    super(
      `merchant destination must be an SS58 account, 0x-prefixed AccountId32, or H160 address; got ${value}`,
    );
    this.name = "InvalidDestinationAccountError";
  }
}

export function isH160Address(value: string): boolean {
  return ethers.isHexString(value, 20);
}

export function normalizeH160Address(value: string): H160Hex {
  if (!isH160Address(value)) throw new InvalidAdminAddressError(value);
  return value.toLowerCase() as H160Hex;
}

export function isAccountId32Hex(value: string): boolean {
  return ACCOUNT_ID32_RE.test(value);
}

export function normalizeAccountId32Hex(value: string): AccountId32Hex {
  if (!isAccountId32Hex(value)) throw new InvalidDestinationAccountError(value);
  return value.toLowerCase() as AccountId32Hex;
}

export function h160ToAccountId32(value: string): AccountId32Hex {
  const normalized = normalizeH160Address(value).slice(2);
  return `${LEFT_PADDED_H160_PREFIX}${normalized}` as AccountId32Hex;
}

export function accountId32ToH160IfLeftPadded(value: string): H160Hex | null {
  const normalized = normalizeAccountId32Hex(value);
  if (!normalized.startsWith(LEFT_PADDED_H160_PREFIX)) return null;
  return `0x${normalized.slice(LEFT_PADDED_H160_PREFIX.length)}` as H160Hex;
}

export function publicKeyToSs58(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`expected a 32-byte product account public key; got ${publicKey.length}`);
  }
  return fromBufferToBase58(SS58_PREFIX_SUBSTRATE)(publicKey);
}

/**
 * Derive the H160 EVM address from a 32-byte Substrate public key.
 *
 * Mirrors pallet-revive's `ReviveApi.address` server-side so the sign-in
 * flow doesn't need a chain RPC round-trip.
 *
 * Two cases matching the on-chain rules:
 *   1. EVM-mapped accounts — upper 12 bytes are the `0xEE` sentinel marker.
 *      The original H160 is the lower 20 bytes.
 *   2. Native (sr25519/ed25519) — H160 is the last 20 bytes of
 *      `keccak256(publicKey)`.
 */
export function deriveH160(publicKey: Uint8Array): H160Hex {
  if (publicKey.length !== ACCOUNTID_BYTE_LEN) {
    throw new Error(`expected a ${ACCOUNTID_BYTE_LEN}-byte public key; got ${publicKey.length}`);
  }
  const isEvmMapped = publicKey.slice(H160_BYTE_LEN).every((b) => b === EVM_DERIVED_MARKER);
  const slice = isEvmMapped
    ? publicKey.slice(0, H160_BYTE_LEN)
    : keccak_256(publicKey).slice(ACCOUNTID_BYTE_LEN - H160_BYTE_LEN, ACCOUNTID_BYTE_LEN);
  let out = "0x";
  for (const byte of slice) out += byte.toString(16).padStart(2, "0");
  return out as H160Hex;
}

export function normalizeMerchantDestinationInput(value: string): AccountId32Hex {
  const trimmed = value.trim();
  if (isAccountId32Hex(trimmed)) return normalizeAccountId32Hex(trimmed);
  if (isH160Address(trimmed)) return h160ToAccountId32(trimmed);
  const info = getSs58AddressInfo(trimmed);
  if (info.isValid && info.publicKey.length === 32) {
    return bytesToHex(info.publicKey) as AccountId32Hex;
  }
  throw new InvalidDestinationAccountError(value);
}

export function hexToBytes(value: `0x${string}`): Uint8Array {
  const hex = value.slice(2);
  if (hex.length % 2 !== 0) {
    throw new Error(`hex string has odd length: ${value}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex digit in ${value}`);
    out[i] = byte;
  }
  return out;
}

export function accountId32HexToSs58(value: string): string {
  const normalized = normalizeAccountId32Hex(value);
  return publicKeyToSs58(hexToBytes(normalized));
}
export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}
