/**
 * Published item-config registry read query.
 *
 * Replaces the registry half of the old `useItemConfigs` hook: a chain
 * read (`listItemConfigRecords`) plus one IPFS envelope fetch per CID,
 * folded into `publishedSnapshots`. The 5s `refetchInterval` replaces the
 * former `setInterval` poller so every admin device picks up another
 * device's publish quickly; the query cache dedups the fan-out across the
 * Items tab + Configure-T3rminal screen (no provider needed). Envelope
 * bodies are cached by CID (content-addressed, hence immutable) to keep
 * the 5s poll cheap — only new CIDs hit the IPFS gateway.
 *
 * Demo mode has no chain to read: its registry starts empty and only
 * holds whatever an in-session demo publish wrote into the query cache.
 */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import { resolveNetwork } from "@shared/chain/host";

import { envConfig } from "@shared/config";
import { fetchItemConfigEnvelope } from "./item-config-storage.ts";
import { listItemConfigRecords, type ItemConfigRegistryRecord } from "./item-configs-read.ts";
import type { PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

// Poll the registry every 5s so each admin device converges on configs
// another device has published.
const ITEM_CONFIG_REGISTRY_POLL_MS = 5_000;

// Envelope bodies are content-addressed by CID, so a body never changes
// for a given CID. Cache decoded bodies across polls: the 5s refetch then
// only fetches genuinely new CIDs from the IPFS gateway.
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
  const records = await withSpan("item-configs.list", "chain.read", () =>
    listItemConfigRecords(),
  );
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
      // Body already decoded for this CID → skip the gateway round-trip.
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
