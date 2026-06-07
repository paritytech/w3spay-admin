/**
 * Token-balance read query for the Balances tab.
 *
 * `tokenBalancesQueryOptions` fetches the whole visible address set in one
 * query keyed by an order-independent fingerprint, so `[a,b]` and `[b,a]`
 * share a cache entry. `useTokenBalances` adapts it into the
 * `UseTokenBalancesResult` contract the screen already consumes. The query
 * cache (with a 60s `refetchInterval`) replaces the former in-memory
 * `balanceCache` Map. Demo balances are synthesized inside the `queryFn`.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  fetchTokenBalance,
  TOKEN_BALANCE_TTL_MS,
  type BalanceLoadState,
  type UseTokenBalancesResult,
} from "./token-balance.ts";
import { getDemoTokenBalance } from "@shared/lib/demo/demo-balances.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { addressSetKey, queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import type { AccountId32Hex } from "@shared/lib/address.ts";

const EMPTY_BALANCES: ReadonlyMap<AccountId32Hex, bigint> = new Map();

export function tokenBalancesQueryOptions(addresses: ReadonlyArray<AccountId32Hex>) {
  const sorted = [...addresses].sort();
  return queryOptions({
    queryKey: queryKeys.tokenBalances(addressSetKey(addresses)),
    queryFn: async (): Promise<ReadonlyMap<AccountId32Hex, bigint>> => {
      const out = new Map<AccountId32Hex, bigint>();
      if (isDemoMode()) {
        for (const addr of sorted) out.set(addr, getDemoTokenBalance(addr));
        return out;
      }
      await Promise.all(
        sorted.map(async (addr) => {
          out.set(addr, await fetchTokenBalance(addr));
        }),
      );
      return out;
    },
    enabled: addresses.length > 0,
    refetchInterval: TOKEN_BALANCE_TTL_MS,
  });
}

export function useTokenBalances(
  addresses: ReadonlyArray<AccountId32Hex>,
): UseTokenBalancesResult {
  const query = useQuery(tokenBalancesQueryOptions(addresses));

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.tokenBalances });
  }, []);
  // The query reads the whole visible set at once, so a single-address
  // refresh just re-fetches the set (one People-chain read per address).
  const refreshOne = useCallback(async (_accountId32: AccountId32Hex) => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.tokenBalances });
  }, []);

  let state: BalanceLoadState;
  if (addresses.length === 0) {
    state = "ready";
  } else if (query.isError) {
    state = "error";
  } else if (query.data != null) {
    state = "ready";
  } else {
    state = "loading";
  }

  return {
    balances: query.data ?? EMPTY_BALANCES,
    state,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : String(query.error)
      : null,
    refresh,
    refreshOne,
  };
}
