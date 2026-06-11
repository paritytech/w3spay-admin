// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import { normalizeH160Address } from "@shared/lib/address.ts";
import {
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "./merchant-registry-write.ts";

/**
 * Super-admin-only batch admin grant. Normalizes + dedupes the H160 inputs and
 * calls the registry's `bulkAddAdmins`. No chain-effect oracle: the call is
 * idempotent (already-admin entries are skipped) and the `AdminAdded` events
 * are the confirmation, so a read-back would only add latency.
 *
 * Throws on the registry's `"Not super admin"` revert when the caller is not a
 * registry super admin — the UI maps that to a friendly message.
 */
export async function bulkAddAdmins(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly addresses: readonly string[];
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const normalized = Array.from(new Set(options.addresses.map((a) => normalizeH160Address(a))));
  if (normalized.length === 0) throw new Error("No admin addresses provided.");
  return writeMerchantRegistry({
    context: options.context,
    functionName: "bulkAddAdmins",
    args: [normalized],
    onStatus: options.onStatus,
  });
}

export async function addSuperAdmin(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly address: string;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  return writeMerchantRegistry({
    context: options.context,
    functionName: "addSuperAdmin",
    args: [normalizeH160Address(options.address)],
    onStatus: options.onStatus,
  });
}
