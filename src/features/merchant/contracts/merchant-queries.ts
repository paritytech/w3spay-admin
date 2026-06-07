/**
 * Merchant-registry read query.
 *
 * `merchantRegistryQueryOptions` is the shared factory (route loaders +
 * the merchant-contract composition). `useMerchantRegistry` adapts the
 * `useQuery` result into the `MerchantRegistryReadState` machine the gate
 * (`resolveAccessVariant`) and `RegistryShell` branch on.
 * Demo mode is a branch inside the `queryFn`: it reads the in-memory
 * `demo-merchant-registry` bridge that the write mutations mutate, so
 * the read/write demo path shares one source of truth.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";

import { envConfig } from "@shared/config";
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
        : withSpan("merchant-registry.list", "chain.read", () =>
            listMerchantEntries(resolveRegistryAddress()),
          ),
    // Demo reads the in-memory bridge; a real empty address is surfaced
    // as a config-error by the adapter, not a failed fetch.
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
