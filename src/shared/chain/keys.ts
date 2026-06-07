/**
 * Centralized TanStack Query keys.
 *
 * One module so invalidation prefixes can't drift from the keys queries
 * register under. Each factory returns an `as const` tuple; mutations
 * invalidate by the bare root prefix (e.g. `["merchant-registry"]`),
 * which TanStack matches against every key that starts with it.
 */

import type { AccountId32Hex } from "@shared/lib/address.ts";

export const queryKeys = {
  merchantRegistry: (network: string, registryAddress: string) =>
    ["merchant-registry", network, registryAddress] as const,

  isAdmin: (adminH160: string | null, registryAddress: string) =>
    ["is-admin", adminH160, registryAddress] as const,

  reportIndex: (shopKey: string) => ["report-index", shopKey] as const,

  reportIndices: (fingerprint: string) => ["report-indices", fingerprint] as const,

  tokenBalances: (sortedKey: string) => ["token-balances", sortedKey] as const,

  decryptedReport: (cid: string) => ["decrypted-report", cid] as const,

  dailyReport: (shopKey: string, date: string) =>
    ["daily-report", shopKey.toLowerCase(), date] as const,

  itemConfigRegistry: (account: string | null) =>
    ["item-config-registry", account] as const,
} as const;

/** Root prefixes for `invalidateQueries({ queryKey: ROOT })`. */
export const queryRoots = {
  merchantRegistry: ["merchant-registry"] as const,
  isAdmin: ["is-admin"] as const,
  reportIndex: ["report-index"] as const,
  reportIndices: ["report-indices"] as const,
  tokenBalances: ["token-balances"] as const,
  dailyReport: ["daily-report"] as const,
  itemConfigRegistry: ["item-config-registry"] as const,
} as const;

/** Stable, order-independent fingerprint for a set of addresses. */
export function addressSetKey(addresses: ReadonlyArray<AccountId32Hex>): string {
  return [...addresses].sort().join("|");
}
