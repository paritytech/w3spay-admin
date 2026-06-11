// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { envConfig } from "@/config.ts";
import { checkIsAdmin, checkIsSuperAdmin, type IsAdminState, type UseIsAdminResult } from "./is-admin.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { isInHost } from "@shared/chain/host-connection.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import type { ChainSupport } from "@features/session/permissions.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

export function isAdminQueryEnabled(
  adminH160: string | null,
  hostChainSupport: ChainSupport | null = null,
  inHost = isInHost(),
  demo = isDemoMode(),
): boolean {
  if (demo) return true;
  if (adminH160 == null || envConfig.contracts.merchantRegistryAddress.trim() === "") return false;
  if (inHost && hostChainSupport == null) return false;
  if (hostChainSupport?.kind === "unavailable") return false;
  return true;
}

export function isAdminQueryOptions(
  adminH160: string | null,
  hostChainSupport: ChainSupport | null = null,
) {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.isAdmin(adminH160, registryAddress),
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode()) return true;
      // `enabled` guarantees a non-null H160 on the real path.
      if (adminH160 == null) return false;
      return checkIsAdmin(adminH160, registryAddress);
    },
    enabled: isAdminQueryEnabled(adminH160, hostChainSupport),
  });
}

export function useIsAdmin(adminH160: string | null): UseIsAdminResult {
  const hostChainSupport = useSessionStore((s) => s.hostChainSupport);
  const query = useQuery(isAdminQueryOptions(adminH160, hostChainSupport));
  const enabled = isAdminQueryEnabled(adminH160, hostChainSupport);

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

export function isSuperAdminQueryOptions(
  adminH160: string | null,
  hostChainSupport: ChainSupport | null = null,
) {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.isSuperAdmin(adminH160, registryAddress),
    queryFn: async (): Promise<boolean> => {
      if (isDemoMode()) return true;
      // `enabled` guarantees a non-null H160 on the real path.
      if (adminH160 == null) return false;
      return checkIsSuperAdmin(adminH160, registryAddress);
    },
    enabled: isAdminQueryEnabled(adminH160, hostChainSupport),
  });
}

export function useIsSuperAdmin(adminH160: string | null): UseIsAdminResult {
  const hostChainSupport = useSessionStore((s) => s.hostChainSupport);
  const query = useQuery(isSuperAdminQueryOptions(adminH160, hostChainSupport));
  const enabled = isAdminQueryEnabled(adminH160, hostChainSupport);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.isSuperAdmin });
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
