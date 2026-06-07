/**
 * Composition hook backing the Items tab + Configure-T3rminal screen.
 *
 * The former 480-line hook is dissolved into three sources, recombined
 * here into the `UseItemConfigsResult` contract consumers already use:
 *   - local drafts + pure mutations → `use-item-drafts-store` (Zustand)
 *   - published registry read (snapshots + 60s poll) → `item-config-queries`
 *   - the publish flow (Bulletin + chain upsert) → `item-config-mutations`
 *
 * No provider: the registry TanStack Query dedups the fan-out across both
 * screens, replacing the old single-mount `<ItemConfigsProvider>`.
 */

import { useEffect, useMemo } from "react";

import { dirtyConfigIds, publishedConfigsToAdopt } from "@features/items/item-config-drafts.ts";
import type { UseItemConfigsResult } from "@features/items/item-configs.ts";
import { useItemConfigPublish } from "./item-config-mutations.ts";
import { useItemConfigRegistry } from "./item-config-queries.ts";
import { useHydrateItemDrafts, useItemDraftsStore } from "@features/items/store/use-item-drafts-store.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

export function useItemConfigs(): UseItemConfigsResult {
  useHydrateItemDrafts();

  const configs = useItemDraftsStore((s) => s.configs);
  const writeInFlight = useItemDraftsStore((s) => s.writeInFlight);
  const lastError = useItemDraftsStore((s) => s.lastError);
  const createConfig = useItemDraftsStore((s) => s.createConfig);
  const duplicateConfig = useItemDraftsStore((s) => s.duplicateConfig);
  const deleteConfig = useItemDraftsStore((s) => s.deleteConfig);
  const upsertItem = useItemDraftsStore((s) => s.upsertItem);
  const deleteItem = useItemDraftsStore((s) => s.deleteItem);
  const resetError = useItemDraftsStore((s) => s.resetError);
  const fromSeed = useItemDraftsStore((s) => s.fromSeed);
  const hydrated = useItemDraftsStore((s) => s.hydrated);
  const adoptPublished = useItemDraftsStore((s) => s.adoptPublished);

  const { publishedRegistry, publishedSnapshots, registryLoaded, refreshPublishedRegistry } =
    useItemConfigRegistry();

  // Registry → drafts sync: on a device with no genuine local edits the
  // seed is a fallback, not a default (see items-mock.ts), so published
  // Bulletin configs replace it once the registry resolves. No-op once
  // the device has local drafts; idempotent against the 60s refetch.
  useEffect(() => {
    if (!hydrated) return;
    const adopt = publishedConfigsToAdopt(fromSeed, publishedSnapshots);
    if (adopt) adoptPublished(adopt);
  }, [hydrated, fromSeed, publishedSnapshots, adoptPublished]);

  const account = useSessionStore((s) => s.readyAccount);
  const { saveAllChanged, saveConfig, publishInFlight, publishProgress } =
    useItemConfigPublish(account);

  const dirty = useMemo(
    () => dirtyConfigIds(configs, publishedSnapshots),
    [configs, publishedSnapshots],
  );

  return {
    configs,
    publishedSnapshots,
    publishedRegistry,
    dirtyConfigIds: dirty,
    writeInFlight,
    publishInFlight,
    publishProgress,
    registryLoaded,
    lastError,
    createConfig,
    duplicateConfig,
    deleteConfig,
    upsertItem,
    deleteItem,
    saveAllChanged,
    saveConfig,
    refreshPublishedRegistry,
    resetError,
  };
}
