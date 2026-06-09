// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";

import { envConfig } from "@/config.ts";
import { listMerchantEntries } from "./list-merchant-entries.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";
import type { RegistryMerchantRow } from "@features/merchant/merchant-model.ts";
import { getDemoMerchantRows } from "@shared/lib/demo/demo-merchant-registry.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

const REGISTRY_NOT_CONFIGURED = "VITE_W3SPAY_REGISTRY_ADDRESS is not configured.";

export function merchantRegistryConfigured(): boolean {
  return envConfig.contracts.merchantRegistryAddress.trim() !== "";
}

export function merchantRegistryQueryOptions() {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.merchantRegistry(envConfig.chain.network, registryAddress),
    queryFn: (): Promise<ReadonlyArray<RegistryMerchantRow>> =>
      isDemoMode()
        ? Promise.resolve(getDemoMerchantRows())
        : withSpan("w3spay-admin:merchant-registry.list", "chain.read", () =>
            listMerchantEntries(resolveRegistryAddress()),),
    // A real empty address is surfaced as a config-error, not a failed fetch.
    enabled: isDemoMode() || merchantRegistryConfigured(),
  });
}

/** Read-only registry state machine derived from the query. */
export type MerchantRegistryReadState =
  | { kind: "loading" }
  | { kind: "config-error"; reason: string }
  | { kind: "error"; reason: string }
  | { kind: "ready"; rows: ReadonlyArray<RegistryMerchantRow> };

export interface UseMerchantRegistryResult {
  readonly state: MerchantRegistryReadState;
  refresh(): Promise<void>;
}

export function useMerchantRegistry(): UseMerchantRegistryResult {
  const query = useQuery(merchantRegistryQueryOptions());

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.merchantRegistry });
  }, []);

  let state: MerchantRegistryReadState;
  if (!isDemoMode() && !merchantRegistryConfigured()) {
    state = { kind: "config-error", reason: REGISTRY_NOT_CONFIGURED };
  } else if (query.isError) {
    state = {
      kind: "error",
      reason: query.error instanceof Error ? query.error.message : String(query.error),
    };
  } else if (query.data != null) {
    state = { kind: "ready", rows: query.data };
  } else {
    state = { kind: "loading" };
  }

  return { state, refresh };
}
