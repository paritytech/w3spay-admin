// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { AccountId32Hex } from "@shared/lib/address.ts";

export const queryKeys = {
  merchantRegistry: (network: string, registryAddress: string) =>
    ["merchant-registry", network, registryAddress] as const,

  restaurantRegistry: (network: string, registryAddress: string) =>
    ["restaurant-registry", network, registryAddress] as const,

  processorConfigRegistry: (network: string, registryAddress: string) =>
    ["processor-config-registry", network, registryAddress] as const,

  isAdmin: (adminH160: string | null, registryAddress: string) =>
    ["is-admin", adminH160, registryAddress] as const,

  isSuperAdmin: (adminH160: string | null, registryAddress: string) =>
    ["is-super-admin", adminH160, registryAddress] as const,

  reportIndex: (shopKey: string) => ["report-index", shopKey] as const,

  reportIndices: (fingerprint: string) => ["report-indices", fingerprint] as const,

  tokenBalances: (sortedKey: string) => ["token-balances", sortedKey] as const,

  decryptedReport: (cid: string) => ["decrypted-report", cid] as const,

  dailyReport: (shopKey: string, date: string) =>
    ["daily-report", shopKey.toLowerCase(), date] as const,

  processorReportIndex: (groupId: string) => ["processor-report-index", groupId] as const,

  processorReport: (cid: string, unlockNonce: number) =>
    ["processor-report", cid, unlockNonce] as const,

  itemConfigRegistry: (account: string | null) =>
    ["item-config-registry", account] as const,
} as const;

/** Root prefixes for `invalidateQueries({ queryKey: ROOT })`. */
export const queryRoots = {
  merchantRegistry: ["merchant-registry"] as const,
  restaurantRegistry: ["restaurant-registry"] as const,
  processorConfigRegistry: ["processor-config-registry"] as const,
  isAdmin: ["is-admin"] as const,
  isSuperAdmin: ["is-super-admin"] as const,
  reportIndex: ["report-index"] as const,
  reportIndices: ["report-indices"] as const,
  tokenBalances: ["token-balances"] as const,
  dailyReport: ["daily-report"] as const,
  processorReportIndex: ["processor-report-index"] as const,
  processorReport: ["processor-report"] as const,
  itemConfigRegistry: ["item-config-registry"] as const,
} as const;

/** Stable, order-independent fingerprint for a set of addresses. */
export function addressSetKey(addresses: ReadonlyArray<AccountId32Hex>): string {
  return [...addresses].sort().join("|");
}
