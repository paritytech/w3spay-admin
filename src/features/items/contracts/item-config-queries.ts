// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import { resolveNetwork } from "@shared/chain/host";

import { envConfig } from "@/config.ts";
import { fetchItemConfigEnvelope } from "./item-config-storage.ts";
import { listItemConfigRecords, type ItemConfigRegistryRecord } from "./item-configs-read.ts";
import type { PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient, REGISTRY_POLL_MS } from "@shared/chain/query-client.ts";

// Envelope bodies are content-addressed by CID, so a body never changes
// for a given CID. Cache decoded bodies across polls: each refetch then
// only fetches genuinely new CIDs from Bulletin.
const envelopeBodyCache = new Map<string, ItemConfig>();

export interface ItemConfigRegistrySnapshot {
  readonly publishedRegistry: ReadonlyArray<ItemConfigRegistryRecord>;
  readonly publishedSnapshots: ReadonlyMap<string, PublishedConfigSnapshot>;
}

function demoRegistrySnapshot(): ItemConfigRegistrySnapshot {
  // No synthetic seed: demo starts with an empty registry and only holds
  // snapshots an in-session demo publish wrote into the cache, so the
  // poll doesn't revert them.
  const prev = queryClient.getQueryData<ItemConfigRegistrySnapshot>(
    itemConfigRegistryQueryOptions().queryKey,
  );
  return prev ?? { publishedRegistry: [], publishedSnapshots: new Map() };
}

async function fetchRegistrySnapshot(): Promise<ItemConfigRegistrySnapshot> {
  const records = await withSpan("w3spay-admin:item-configs.list", "chain.read", () =>
    listItemConfigRecords(),);
  const gateway = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const publishedSnapshots = new Map<string, PublishedConfigSnapshot>();
  await Promise.all(
    records.map(async (record) => {
      const cachedBody = envelopeBodyCache.get(record.cid);
      publishedSnapshots.set(record.configId, {
        configId: record.configId,
        cid: record.cid,
        size: record.size,
        updatedAt: record.updatedAt,
        snapshot: cachedBody ?? null,
      });
      // Body already decoded for this CID → skip the Bulletin round-trip.
      if (cachedBody) return;
      const envelope = await fetchItemConfigEnvelope({ cid: record.cid, gatewayBase: gateway });
      if (envelope) {
        envelopeBodyCache.set(record.cid, envelope.config);
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
    refetchInterval: REGISTRY_POLL_MS,
      staleTime: 0,
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
