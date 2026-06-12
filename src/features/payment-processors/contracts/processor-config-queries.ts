// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions } from "@tanstack/react-query";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import { envConfig } from "@/config.ts";
import {
  listProcessorConfigRecords,
  type ProcessorConfigRegistryRecord,
} from "./list-processor-configs.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys } from "@shared/chain/keys.ts";
import { REGISTRY_POLL_MS } from "@shared/chain/query-client.ts";

export function processorConfigRegistryConfigured(): boolean {
  return envConfig.contracts.merchantRegistryAddress.trim() !== "";
}

// In-memory demo registry: only holds what an in-session demo publish wrote.
// The admin never decrypts envelopes, so the record is the public metadata.
let demoConfigState: ProcessorConfigRegistryRecord[] = [];

export function getDemoProcessorConfigs(): ReadonlyArray<ProcessorConfigRegistryRecord> {
  return demoConfigState;
}

export function setDemoProcessorConfigs(next: ReadonlyArray<ProcessorConfigRegistryRecord>): void {
  demoConfigState = [...next];
}

export function processorConfigRegistryQueryOptions() {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.processorConfigRegistry(envConfig.chain.network, registryAddress),
    queryFn: (): Promise<ReadonlyArray<ProcessorConfigRegistryRecord>> =>
      isDemoMode()
        ? Promise.resolve(getDemoProcessorConfigs())
        : withSpan("w3spay-admin:processor-config-registry.list", "chain.read", () =>
            listProcessorConfigRecords(resolveRegistryAddress()),),
    enabled: isDemoMode() || processorConfigRegistryConfigured(),
    refetchInterval: REGISTRY_POLL_MS,
  });
}
