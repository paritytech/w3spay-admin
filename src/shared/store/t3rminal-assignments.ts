/**
 * Local-only assignment records binding a T3rminal merchant row to a
 * published item config. Persisted via `useTerminalStore` (host KV or
 * `localStorage`) — not pushed to the merchant registry contract; the
 * QR-payload contract intentionally keeps terminal ↔ config wiring on
 * the admin device.
 *
 * Storage shape is versioned so future schema rotations can detect old
 * payloads without inferring from absence-of-fields.
 */

import { bytesToHex, hexToBytes } from "@shared/lib/address.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { Item, ItemConfig } from "@features/items/items-model.ts";
import {
  T3RMINAL_REPORT_PASSWORD_SCHEME_V1,
  createPasswordSeed,
} from "@shared/lib/t3rminal-config-qr.ts";

/** Stable storage key under the admin app's KV prefix. */
export const T3RMINAL_ASSIGNMENTS_KEY = "t3rminal-assignments/v1" as const;

export interface T3rminalAssignmentV1 {
  readonly merchantKey: string;
  readonly itemConfigId: string;
  /**
   * CID of the published item config snapshot. Retained on the admin
   * device for operator audit/history so the assignment list shows
   * which Bulletin record was bound at QR-issue time. Not part of the
   * v2 QR wire payload — the v2 QR carries the full item config body.
   */
  readonly itemConfigCid: string;
  /** SS58 of the merchant's payout destination — pinned at QR-issue time. */
  readonly receivingAddress: string;
  readonly passwordScheme: "admin-public-key-sha256-v1";
  readonly reportPassword: string;
  /** Hex-encoded random salt used to derive `reportPassword`. */
  readonly passwordSaltHex: `0x${string}`;
  /** SS58 of the admin product account that signed the publish. */
  readonly adminPublicKeyHex: `0x${string}`;
  readonly issuedAt: string;
  /**
   * Wire form of the most recently issued QR for this assignment.
   * `1` = legacy JSON pointer payload, `2` = BCTS UR with the full
   * item config inline. Absent on records written before v2 shipped,
   * which by definition are v1 — decoders treat `undefined` as `1`.
   */
  readonly payloadVersion?: 1 | 2;
  /** Light snapshot for the audit / regenerate UI. */
  readonly itemSummary?: {
    readonly count: number;
    readonly sampleNames: ReadonlyArray<string>;
  };
}

export interface T3rminalAssignmentsPayloadV1 {
  readonly version: 1;
  /** Keyed by `merchantKey`. */
  readonly assignments: Record<string, T3rminalAssignmentV1>;
}

export function encodeAssignmentsPayload(
  assignments: ReadonlyMap<string, T3rminalAssignmentV1>,
): T3rminalAssignmentsPayloadV1 {
  const out: Record<string, T3rminalAssignmentV1> = {};
  for (const [key, value] of assignments) out[key] = value;
  return { version: 1, assignments: out };
}

/**
 * Defensively decode a stored payload. Returns an empty map on any
 * shape mismatch (no throw) so a corrupted KV entry doesn't lock the
 * UI in a broken state — operators just re-bind T3rminal devices.
 */
export function decodeAssignmentsPayload(raw: unknown): Map<string, T3rminalAssignmentV1> {
  if (raw == null || typeof raw !== "object") return new Map();
  const obj = raw as { version?: unknown; assignments?: unknown };
  if (obj.version !== 1 || obj.assignments == null || typeof obj.assignments !== "object") {
    return new Map();
  }
  const out = new Map<string, T3rminalAssignmentV1>();
  for (const [key, value] of Object.entries(obj.assignments as Record<string, unknown>)) {
    const decoded = decodeAssignment(value);
    if (decoded) out.set(key, decoded);
  }
  return out;
}

function decodeAssignment(value: unknown): T3rminalAssignmentV1 | null {
  if (value == null || typeof value !== "object") return null;
  const r = value as Partial<T3rminalAssignmentV1>;
  if (
    typeof r.merchantKey !== "string" ||
    typeof r.itemConfigId !== "string" ||
    typeof r.itemConfigCid !== "string" ||
    typeof r.receivingAddress !== "string" ||
    typeof r.reportPassword !== "string" ||
    typeof r.passwordSaltHex !== "string" ||
    typeof r.adminPublicKeyHex !== "string" ||
    typeof r.issuedAt !== "string"
  ) {
    return null;
  }
  if (r.passwordScheme !== "admin-public-key-sha256-v1") return null;
  const payloadVersion = r.payloadVersion === 2 ? 2 : r.payloadVersion === 1 ? 1 : undefined;
  return {
    merchantKey: r.merchantKey,
    itemConfigId: r.itemConfigId,
    itemConfigCid: r.itemConfigCid,
    receivingAddress: r.receivingAddress,
    passwordScheme: r.passwordScheme,
    reportPassword: r.reportPassword,
    passwordSaltHex: r.passwordSaltHex as `0x${string}`,
    adminPublicKeyHex: r.adminPublicKeyHex as `0x${string}`,
    issuedAt: r.issuedAt,
    ...(payloadVersion !== undefined ? { payloadVersion } : {}),
    itemSummary: r.itemSummary,
  };
}

export function itemSummaryFor(items: ReadonlyArray<Item>): { count: number; sampleNames: ReadonlyArray<string> } {
  return { count: items.length, sampleNames: items.slice(0, 3).map((i) => i.name) };
}

/** Hex helpers re-exported so the screens don't reach into util/address. */
export const saltToHex = (bytes: Uint8Array): `0x${string}` => bytesToHex(bytes);
export const hexToSalt = (hex: `0x${string}`): Uint8Array => hexToBytes(hex);

/**
 * Pure helper that mints (or refreshes) an assignment record from the
 * resolved building blocks. Re-uses `existing.reportPassword` /
 * `existing.passwordSaltHex` unless `regeneratePassword` is true.
 *
 * Lifted out of the `useT3rminalAssignments` hook so the password-
 * preservation contract can be unit-tested without mounting React.
 */
export interface MintAssignmentArgs {
  readonly merchant: AdminMerchant;
  readonly config: ItemConfig;
  readonly itemConfigCid: string;
  readonly adminPublicKey: Uint8Array;
  readonly existing: T3rminalAssignmentV1 | null;
  readonly regeneratePassword: boolean;
  readonly nowIso: string;
  /**
   * Wire format the freshly minted QR will use. Defaults to v2 — the
   * BCTS UR + dCBOR transport — so new admin builds always issue v2
   * QR codes. Callers may force v1 for legacy migrations.
   */
  readonly payloadVersion?: 1 | 2;
}

export function mintAssignmentRecord(args: MintAssignmentArgs): T3rminalAssignmentV1 {
  let reportPassword: string;
  let passwordSaltHex: `0x${string}`;
  if (args.existing && !args.regeneratePassword) {
    reportPassword = args.existing.reportPassword;
    passwordSaltHex = args.existing.passwordSaltHex;
  } else {
    const seed = createPasswordSeed(args.adminPublicKey);
    reportPassword = seed.password;
    passwordSaltHex = bytesToHex(seed.salt);
  }
  return {
    merchantKey: args.merchant.key,
    itemConfigId: args.config.id,
    itemConfigCid: args.itemConfigCid,
    receivingAddress: args.merchant.destinationSs58,
    passwordScheme: T3RMINAL_REPORT_PASSWORD_SCHEME_V1,
    reportPassword,
    passwordSaltHex,
    adminPublicKeyHex: bytesToHex(args.adminPublicKey),
    issuedAt: args.nowIso,
    payloadVersion: args.payloadVersion ?? 2,
    itemSummary: itemSummaryFor(args.config.items),
  };
}

export interface UpsertAssignmentArgs {
  readonly merchant: AdminMerchant;
  readonly config: ItemConfig;
  readonly itemConfigCid: string;
  readonly adminPublicKey: Uint8Array;
  /** When true, replace the existing salt + password. */
  readonly regeneratePassword?: boolean;
  /** ISO timestamp; threaded in so tests can pin it. */
  readonly nowIso: string;
  /** Optional override for the QR wire format; defaults to v2. */
  readonly payloadVersion?: 1 | 2;
}

export interface UseT3rminalAssignmentsResult {
  readonly assignments: ReadonlyMap<string, T3rminalAssignmentV1>;
  readonly hydrated: boolean;
  upsertAssignment(args: UpsertAssignmentArgs): T3rminalAssignmentV1;
  removeAssignment(merchantKey: string): void;
}
