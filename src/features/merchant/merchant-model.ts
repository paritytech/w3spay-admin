// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { keccak256, encodePacked } from "viem";

import {
  accountId32HexToSs58,
  accountId32ToH160IfLeftPadded,
  normalizeMerchantDestinationInput,
  type AccountId32Hex,
  type H160Hex,
} from "@shared/lib/address.ts";

export type MerchantLifecycle = "active" | "paused" | "revoked";

/** POS terminal vs T3rminal device — derived from the terminalId prefix, not stored on-chain. */
export type MerchantKind = "pos" | "t3rminal";

/**
 * Tags a T3rminal device's `terminalId`: `${T3RMINAL_TERMINAL_ID_PREFIX}{accountId32 hex without 0x}`.
 * Embedding the destination yields a deterministic, collision-free id under the
 * contract's `(merchantId, terminalId)` uniqueness key.
 */
export const T3RMINAL_TERMINAL_ID_PREFIX = "t3r-";

export function merchantKindFromTerminalId(terminalId: string): MerchantKind {
  return terminalId.startsWith(T3RMINAL_TERMINAL_ID_PREFIX) ? "t3rminal" : "pos";
}

export function t3rminalTerminalIdForDestination(accountId32: AccountId32Hex): string {
  return `${T3RMINAL_TERMINAL_ID_PREFIX}${accountId32.slice(2).toLowerCase()}`;
}

/**
 * Off-chain mirror of the contract's `_terminalKey` — `keccak256(merchantId || "|" || terminalId)`.
 * Always lowercase 0x-prefixed; comparing against the read side without
 * lowercase-normalisation will silently miss matches.
 */
export function computeTerminalKey(merchantId: string, terminalId: string): `0x${string}` {
  return keccak256(
    encodePacked(["string", "string", "string"], [merchantId, "|", terminalId]),
  ).toLowerCase() as `0x${string}`;
}
export interface MerchantForm {
  terminalId: string;
  merchantId: string;
  displayName: string;
  destination: string;
}

export interface MerchantFormErrors {
  terminalId?: string;
  merchantId?: string;
  destination?: string;
}

export type RegisterMerchantInput =
  | {
      readonly ok: true;
      readonly payload: {
        readonly merchantId: string;
        readonly terminalId: string;
        readonly destinationAccountId: AccountId32Hex;
        readonly displayName: string;
      };
      readonly terminalKey: `0x${string}`;
    }
  | { readonly ok: false; readonly errors: MerchantFormErrors };

/**
 * Validate a merchant form and build the `registerMerchant` payload.
 * For T3rminal devices the terminalId is derived from the destination and
 * the display name defaults to `defaultT3rminalDisplayName`.
 */
export function buildRegisterMerchant(
  form: MerchantForm,
  merchants: ReadonlyArray<AdminMerchant>,
  kind: MerchantKind,
): RegisterMerchantInput {
  const errors: MerchantFormErrors = {};
  const merchantId = form.merchantId.trim();
  if (!merchantId) errors.merchantId = "Required.";

  let destinationAccountId: AccountId32Hex | null = null;
  try {
    destinationAccountId = normalizeMerchantDestinationInput(form.destination);
  } catch (caught) {
    errors.destination = caught instanceof Error ? caught.message : String(caught);
  }

  let terminalId = "";
  if (kind === "t3rminal") {
    if (destinationAccountId != null) {
      terminalId = t3rminalTerminalIdForDestination(destinationAccountId);
    }
  } else {
    terminalId = form.terminalId.trim();
    if (!terminalId) errors.terminalId = "Required.";
  }

  if (
    terminalId !== "" &&
    merchants.some((m) => m.terminalId === terminalId && m.merchantId === merchantId)
  ) {
    if (kind === "t3rminal") {
      errors.destination = "This T3rminal device is already registered under this merchant.";
    } else {
      errors.terminalId = "This (merchantId, terminalId) pair is already registered.";
    }
  }

  if (destinationAccountId == null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const displayNameInput = form.displayName.trim();
  const displayName =
    displayNameInput !== ""
      ? displayNameInput
      : kind === "t3rminal"
        ? defaultT3rminalDisplayName(destinationAccountId)
        : "";

  return {
    ok: true,
    payload: { merchantId, terminalId, destinationAccountId, displayName },
    terminalKey: computeTerminalKey(merchantId, terminalId),
  };
}

export interface RegistryMerchantRow {
  readonly key: string;
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
  readonly displayName: string;
  readonly status: MerchantLifecycle;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AdminMerchant {
  /** terminalKey from the on-chain row. */
  readonly key: string;
  readonly merchantId: string;
  readonly terminalId: string;
  /** Resolved display name. Falls back to terminalId when the row's displayName is empty. */
  readonly name: string;
  /** Raw on-chain displayName, if any. */
  readonly displayName: string;
  readonly status: MerchantLifecycle;
  /** POS vs T3rminal — derived from the terminalId prefix. */
  readonly kind: MerchantKind;
  /** 32-byte AccountId32 payout destination, lowercase 0x-prefixed hex. */
  readonly destinationAccountId: AccountId32Hex;
  /** SS58 (prefix 42) encoding of `destinationAccountId` — the canonical display form. */
  readonly destinationSs58: string;
  /** Derived H160 when the destination matches the left-padded-H160 convention. */
  readonly derivedH160: H160Hex | null;
  /** ISO timestamp captured at register-time. */
  readonly createdAt: string;
  /** ISO timestamp of last on-chain update. */
  readonly updatedAt: string;
}

export function merchantFromRegistryRow(row: RegistryMerchantRow): AdminMerchant {
  const name = row.displayName.trim() === "" ? row.terminalId : row.displayName;
  return {
    key: row.key,
    merchantId: row.merchantId,
    terminalId: row.terminalId,
    name,
    displayName: row.displayName,
    status: row.status,
    kind: merchantKindFromTerminalId(row.terminalId),
    destinationAccountId: row.destinationAccountId,
    destinationSs58: accountId32HexToSs58(row.destinationAccountId),
    derivedH160: derivedH160From(row.destinationAccountId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function derivedH160From(value: string): H160Hex | null {
  try {
    return accountId32ToH160IfLeftPadded(value);
  } catch {
    return null;
  }
}

export const fmtCount = (n: number): string => n.toLocaleString("en-US");

export function shortAddr(value: string | null | undefined, start = 8, end = 6): string {
  if (!value) return "—";
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

/** Truncate a `t3r-` terminalId to `t3r-f3ffe…3f3f`; falls back to `shortAddr` for other ids. */
export function shortTerminalId(terminalId: string, head = 5, tail = 4): string {
  if (terminalId.startsWith(T3RMINAL_TERMINAL_ID_PREFIX)) {
    const body = terminalId.slice(T3RMINAL_TERMINAL_ID_PREFIX.length);
    if (body.length <= head + tail + 1) return terminalId;
    return `${T3RMINAL_TERMINAL_ID_PREFIX}${body.slice(0, head)}…${body.slice(-tail)}`;
  }
  return shortAddr(terminalId);
}

export function defaultT3rminalDisplayName(accountId32: AccountId32Hex): string {
  return `T3rminal · ${shortAddr(accountId32, 8, 6)}`;
}

export function timeAgoFromIso(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.round((now - then) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return d.toISOString().slice(0, 10);
}

export function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}
