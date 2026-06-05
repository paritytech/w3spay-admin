/**
 * Pure reducers for the in-memory merchant registry used in demo mode.
 *
 * Mirrors the contract's effects on `RegistryMerchantRow[]` without
 * touching chain. Every function is shallow-immutable (returns a new
 * array; existing rows are untouched), so React's referential checks
 * downstream still work.
 *
 * Action signatures match the four typed write payloads exposed via
 * `MerchantRegistryActions` — `applyRegister` consumes
 * `AddMerchantPayload`, etc. — so `useDemoMerchantStore` can call them
 * with the same payloads the chain-bound hooks accept.
 */
import type { AddMerchantPayload } from "@features/merchant/api/add-merchant.ts";
import type { DeleteMerchantPayload } from "@features/merchant/api/delete-merchant.ts";
import type { SetMerchantDestinationPayload } from "@features/merchant/api/set-merchant-destination.ts";
import type { SetMerchantStatusPayload } from "@features/merchant/api/set-merchant-status.ts";
import type { UpdateMerchantPayload } from "@features/merchant/api/update-merchant.ts";
import {
  computeTerminalKey,
  type RegistryMerchantRow,
} from "@features/merchant/merchant-model.ts";

export class DemoMerchantNotFoundError extends Error {
  constructor(merchantId: string, terminalId: string) {
    super(`Demo merchant not found: ${merchantId}/${terminalId}`);
    this.name = "DemoMerchantNotFoundError";
  }
}

export class DemoMerchantDuplicateError extends Error {
  constructor(merchantId: string, terminalId: string) {
    super(`Demo merchant already exists: ${merchantId}/${terminalId}`);
    this.name = "DemoMerchantDuplicateError";
  }
}

function indexOfRow(
  rows: ReadonlyArray<RegistryMerchantRow>,
  merchantId: string,
  terminalId: string,
): number {
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (r.merchantId === merchantId && r.terminalId === terminalId) return i;
  }
  return -1;
}

function isoFrom(now: number): string {
  return new Date(now).toISOString();
}

export function applyRegister(
  rows: ReadonlyArray<RegistryMerchantRow>,
  payload: AddMerchantPayload,
  now: number,
): ReadonlyArray<RegistryMerchantRow> {
  if (indexOfRow(rows, payload.merchantId, payload.terminalId) !== -1) {
    throw new DemoMerchantDuplicateError(payload.merchantId, payload.terminalId);
  }
  const iso = isoFrom(now);
  const next: RegistryMerchantRow = {
    key: computeTerminalKey(payload.merchantId, payload.terminalId),
    merchantId: payload.merchantId,
    terminalId: payload.terminalId,
    destinationAccountId: payload.destinationAccountId,
    displayName: payload.displayName,
    status: "active",
    createdAt: iso,
    updatedAt: iso,
  };
  return [...rows, next];
}

export function applyUpdate(
  rows: ReadonlyArray<RegistryMerchantRow>,
  payload: UpdateMerchantPayload,
  now: number,
): ReadonlyArray<RegistryMerchantRow> {
  const idx = indexOfRow(rows, payload.merchantId, payload.terminalId);
  if (idx === -1) {
    throw new DemoMerchantNotFoundError(payload.merchantId, payload.terminalId);
  }
  const existing = rows[idx]!;
  const replaced: RegistryMerchantRow = {
    ...existing,
    destinationAccountId: payload.destinationAccountId,
    displayName: payload.displayName,
    updatedAt: isoFrom(now),
  };
  const out = rows.slice();
  out[idx] = replaced;
  return out;
}

export function applySetStatus(
  rows: ReadonlyArray<RegistryMerchantRow>,
  payload: SetMerchantStatusPayload,
  now: number,
): ReadonlyArray<RegistryMerchantRow> {
  const idx = indexOfRow(rows, payload.merchantId, payload.terminalId);
  if (idx === -1) {
    throw new DemoMerchantNotFoundError(payload.merchantId, payload.terminalId);
  }
  const existing = rows[idx]!;
  if (existing.status === payload.status) return rows;
  const replaced: RegistryMerchantRow = {
    ...existing,
    status: payload.status,
    updatedAt: isoFrom(now),
  };
  const out = rows.slice();
  out[idx] = replaced;
  return out;
}

export function applySetDestination(
  rows: ReadonlyArray<RegistryMerchantRow>,
  payload: SetMerchantDestinationPayload,
  now: number,
): ReadonlyArray<RegistryMerchantRow> {
  const idx = indexOfRow(rows, payload.merchantId, payload.terminalId);
  if (idx === -1) {
    throw new DemoMerchantNotFoundError(payload.merchantId, payload.terminalId);
  }
  const existing = rows[idx]!;
  if (
    existing.destinationAccountId.toLowerCase() ===
    payload.destinationAccountId.toLowerCase()
  ) {
    return rows;
  }
  const replaced: RegistryMerchantRow = {
    ...existing,
    destinationAccountId: payload.destinationAccountId,
    updatedAt: isoFrom(now),
  };
  const out = rows.slice();
  out[idx] = replaced;
  return out;
}

export function applyDelete(
  rows: ReadonlyArray<RegistryMerchantRow>,
  payload: DeleteMerchantPayload,
): ReadonlyArray<RegistryMerchantRow> {
  const idx = indexOfRow(rows, payload.merchantId, payload.terminalId);
  if (idx === -1) {
    throw new DemoMerchantNotFoundError(payload.merchantId, payload.terminalId);
  }
  const out = rows.slice();
  out.splice(idx, 1);
  return out;
}

/**
 * 32-byte synthetic tx hash. Just enough to satisfy the
 * `Promise<\`0x${string}\`>` contract of the registry write actions —
 * the UI surfaces the hash in toast messages.
 *
 * Uses `crypto.getRandomValues` when available (browser + modern Node),
 * falls back to `Math.random` for the rare environment without WebCrypto
 * (no security implications: this is demo telemetry, not entropy).
 */
export function synthesizeTxHash(): `0x${string}` {
  const bytes = new Uint8Array(32);
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto
      : undefined;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}
