/**
 * Published item-config registry read query.
 *
 * Replaces the registry half of the old `useItemConfigs` hook: a chain
 * read (`listItemConfigRecords`) plus one IPFS envelope fetch per CID,
 * folded into `publishedSnapshots`. The 60s `refetchInterval` replaces
 * the former `setInterval` poller; the query cache dedups the fan-out
 * across the Items tab + Configure-T3rminal screen (no provider needed).
 *
 * Demo mode synthesizes snapshots from `ITEM_CONFIGS_SEED` inside the
 * `queryFn`, so the dirty diff against local drafts behaves identically
 * to a real chain read.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import { resolveNetwork } from "@shared/chain/host";

import { envConfig } from "@shared/config";
import { fetchItemConfigEnvelope } from "./item-config-storage.ts";
import { listItemConfigRecords, type ItemConfigRegistryRecord } from "./item-configs-read.ts";
import type { PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import { ITEM_CONFIGS_SEED } from "@features/items/items-mock.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

const ITEM_CONFIG_REGISTRY_POLL_MS = 60_000;

export interface ItemConfigRegistrySnapshot {
  readonly publishedRegistry: ReadonlyArray<ItemConfigRegistryRecord>;
  readonly publishedSnapshots: ReadonlyMap<string, PublishedConfigSnapshot>;
}

function demoRegistrySnapshot(): ItemConfigRegistrySnapshot {
  // Treat the seed as "what the chain believes is published" so the
  // dirty-diff against drafts works exactly as in real chain mode.
  const now = new Date().toISOString();
  const publishedSnapshots = new Map<string, PublishedConfigSnapshot>();
  for (const config of ITEM_CONFIGS_SEED) {
    publishedSnapshots.set(config.id, {
      configId: config.id,
      cid: `bafydemo${config.id}`,
      size: 0,
      updatedAt: now,
      snapshot: config,
    });
  }
  return { publishedRegistry: [], publishedSnapshots };
}

async function fetchRegistrySnapshot(): Promise<ItemConfigRegistrySnapshot> {
  const records = await withSpan("item-configs.list", "chain.read", () =>
    listItemConfigRecords(),
  );
  const gateway = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const publishedSnapshots = new Map<string, PublishedConfigSnapshot>();
  await Promise.all(
    records.map(async (record) => {
      publishedSnapshots.set(record.configId, {
        configId: record.configId,
        cid: record.cid,
        size: record.size,
        updatedAt: record.updatedAt,
        snapshot: null,
      });
      const envelope = await fetchItemConfigEnvelope({ cid: record.cid, gatewayBase: gateway });
      if (envelope) {
        publishedSnapshots.set(record.configId, {
          configId: record.configId,
          cid: record.cid,
          size: record.size,
          updatedAt: record.updatedAt,
          snapshot: envelope.config,
        });
      }
    }),
  );
  return { publishedRegistry: records, publishedSnapshots };
}

export function itemConfigRegistryQueryOptions() {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.itemConfigRegistry(registryAddress),
    queryFn: (): Promise<ItemConfigRegistrySnapshot> =>
      isDemoMode() ? Promise.resolve(demoRegistrySnapshot()) : fetchRegistrySnapshot(),
    enabled: isDemoMode() || registryAddress.trim() !== "",
    refetchInterval: ITEM_CONFIG_REGISTRY_POLL_MS,
  });
}

export interface UseItemConfigRegistryResult extends ItemConfigRegistrySnapshot {
  /** True once the registry query has settled (success or error). */
  readonly registryLoaded: boolean;
  refreshPublishedRegistry(): Promise<void>;
}

const EMPTY_REGISTRY: ReadonlyArray<ItemConfigRegistryRecord> = [];
const EMPTY_SNAPSHOTS: ReadonlyMap<string, PublishedConfigSnapshot> = new Map();

export function useItemConfigRegistry(): UseItemConfigRegistryResult {
  const query = useQuery(itemConfigRegistryQueryOptions());

  const refreshPublishedRegistry = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.itemConfigRegistry });
  }, []);

  return {
    publishedRegistry: query.data?.publishedRegistry ?? EMPTY_REGISTRY,
    publishedSnapshots: query.data?.publishedSnapshots ?? EMPTY_SNAPSHOTS,
    registryLoaded: !query.isPending,
    refreshPublishedRegistry,
  };
}
