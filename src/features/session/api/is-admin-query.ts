/**
 * Admin-check query: `isAdmin(adminH160)` on the merchant registry.
 *
 * `isAdminQueryOptions` is the shared factory (route loaders +
 * components). `useIsAdmin` adapts the `useQuery` result into the
 * `UseIsAdminResult` contract the gate's `resolveAccessVariant`
 * expects, so the gate logic is unchanged.
 *
 * Demo mode short-circuits inside the `queryFn` (always admin) and keeps
 * the query enabled so the gate resolves to "granted" without a chain
 * read — replacing the former dual `Real*`/`Demo*` provider split.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { envConfig } from "@shared/config.ts";
import { checkIsAdmin, type IsAdminState, type UseIsAdminResult } from "./is-admin.ts";
import { isDemoMode } from "@shared/demo/demo-mode.ts";
import { queryClient } from "@shared/api/query-client.ts";
import { queryKeys, queryRoots } from "@shared/api/keys.ts";

/**
 * True when the admin check can run: demo mode (synthetic grant) or a
 * resolved account H160 against a configured registry address.
 */
export function isAdminQueryEnabled(adminH160: string | null): boolean {
  if (isDemoMode()) return true;
  return adminH160 != null && envConfig.contracts.merchantRegistryAddress.trim() !== "";
}

export function isAdminQueryOptions(adminH160: string | null) {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.isAdmin(adminH160, registryAddress),
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode()) return true;
      // `enabled` guarantees a non-null H160 on the real path.
      if (adminH160 == null) return false;
      return checkIsAdmin(adminH160, registryAddress);
    },
    enabled: isAdminQueryEnabled(adminH160),
  });
}

/**
 * Adapter hook: project the admin-check query into the gate's
 * `UseIsAdminResult` shape (`idle | checking | granted | denied |
 * error`). `refresh` invalidates the query key so a gate retry re-runs
 * the check; it is stable across renders.
 */
export function useIsAdmin(adminH160: string | null): UseIsAdminResult {
  const query = useQuery(isAdminQueryOptions(adminH160));
  const enabled = isAdminQueryEnabled(adminH160);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.isAdmin });
  }, []);

  let state: IsAdminState;
  if (!enabled) {
    state = { kind: "idle" };
  } else if (query.isError) {
    state = {
      kind: "error",
      reason: query.error instanceof Error ? query.error.message : String(query.error),
    };
  } else if (query.data === true) {
    state = { kind: "granted" };
  } else if (query.data === false) {
    state = { kind: "denied" };
  } else {
    state = { kind: "checking" };
  }

  return {
    state,
    inFlight: query.isFetching,
    granted: query.data === true,
    refresh,
  };
}
