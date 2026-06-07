import { keccak256, encodePacked } from "viem";

import {
  accountId32HexToSs58,
  accountId32ToH160IfLeftPadded,
  type AccountId32Hex,
  type H160Hex,
} from "@shared/lib/address.ts";

export type MerchantLifecycle = "active" | "paused" | "revoked";

/**
 * Whether a registered merchant entry is a regular POS terminal (manual
 * destination + free-form terminalId) or a T3rminal device (destination
 * doubles as the device identity; terminalId is derived).
 *
 * Stored implicitly: on-chain rows only have `terminalId`. T3rminal rows
 * are recognised by the `T3RMINAL_TERMINAL_ID_PREFIX` prefix on their
 * `terminalId`. `merchantKindFromTerminalId` is the single decoder.
 */
export type MerchantKind = "pos" | "t3rminal";

/**
 * Prefix used to tag a T3rminal device's `terminalId` in the registry.
 * Pattern: `${T3RMINAL_TERMINAL_ID_PREFIX}{accountId32 hex without 0x}`.
 *
 * The contract enforces uniqueness on `(merchantId, terminalId)` via
 * `keccak256(merchantId || "|" || terminalId)`. Embedding the destination
 * in the terminalId gives us a deterministic, collision-free id per device.
 */
export const T3RMINAL_TERMINAL_ID_PREFIX = "t3r-";

export function merchantKindFromTerminalId(terminalId: string): MerchantKind {
  return terminalId.startsWith(T3RMINAL_TERMINAL_ID_PREFIX) ? "t3rminal" : "pos";
}

/**
 * Derive the canonical `terminalId` for a T3rminal device whose payout
 * destination is `accountId32`. The 64-char hex tail is deterministic and
 * collision-free, so admins never have to invent a unique terminalId per
 * device.
 */
export function t3rminalTerminalIdForDestination(accountId32: AccountId32Hex): string {
  return `${T3RMINAL_TERMINAL_ID_PREFIX}${accountId32.slice(2).toLowerCase()}`;
}

/**
 * Off-chain mirror of the contract's `_terminalKey` derivation —
 * `keccak256(abi.encodePacked(merchantId, "|", terminalId))`. Same
 * encoding the Solidity registry uses to key `entries[bytes32 => ...]`
 * (see `contracts/src/W3SPayMerchantRegistry.sol::_terminalKey`).
 *
 * Used by the write-side hooks so we can return the `merchant.key` the
 * registry just minted — without an extra read round-trip — and let the
 * UI navigate to its detail screen immediately after the tx finalizes.
 *
 * Always returns a lowercase 0x-prefixed 32-byte hex string to match
 * viem's `bytes32` decoder, which is what `list-merchant-entries`
 * surfaces on the read side. Comparing both sides without
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

// ── Format helpers ────────────────────────────────────────────────

export const fmtCount = (n: number): string => n.toLocaleString("en-US");

export function shortAddr(value: string | null | undefined, start = 8, end = 6): string {
  if (!value) return "—";
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

/**
 * Truncate a T3rminal `terminalId` to a readable short form.
 *
 * A T3rminal id is `t3r-<64 hex chars>` — too wide for a compact row.
 * The prefix is kept intact so the entry is identifiable at a glance;
 * only the hex body is shortened:
 *
 *   `t3r-f3ffe…3f3f`
 *
 * Falls back to `shortAddr`-style truncation for non-`t3r-` ids so POS
 * terminals and future id schemes degrade gracefully.
 */
export function shortTerminalId(terminalId: string, head = 5, tail = 4): string {
  if (terminalId.startsWith(T3RMINAL_TERMINAL_ID_PREFIX)) {
    const body = terminalId.slice(T3RMINAL_TERMINAL_ID_PREFIX.length);
    if (body.length <= head + tail + 1) return terminalId;
    return `${T3RMINAL_TERMINAL_ID_PREFIX}${body.slice(0, head)}…${body.slice(-tail)}`;
  }
  return shortAddr(terminalId);
}

/**
 * Default `displayName` for a freshly-registered T3rminal whose admin left
 * the display-name field blank. Keeps the directory listing meaningful when
 * the admin only entered an address.
 */
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
