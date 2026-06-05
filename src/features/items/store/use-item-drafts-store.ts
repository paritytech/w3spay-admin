/**
 * Local item-config drafts as a Zustand store (host-KV / localStorage
 * backed) — the *local half* of the former `useItemConfigs` hook.
 *
 * Owns the editable `configs` array and the pure config/item mutations
 * (create / duplicate / delete / upsertItem / deleteItem). The published
 * registry read (snapshots + poll) is now a TanStack Query
 * (`lib/query/item-config-queries`) and the publish flow is a mutation
 * (`lib/query/item-config-mutations`); `dirtyConfigIds`, `saveAllChanged`,
 * and `publishProgress` are composed at the consumer from those + this
 * store.
 *
 * Same persistence model as the other KV stores: async `hydrate()` once
 * (decode or fall back to the seed) + synchronous write-through after
 * each successful mutation. Persist is gated on `hydrated` so an early
 * mutation can't clobber stored drafts with the seed.
 */

import { useEffect } from "react";
import { create } from "zustand";

import { captureError } from "@/shared/telemetry";

import { cachedAdminKvStore, getAdminKvStore } from "@shared/store/admin-kv.ts";
import {
  ITEM_CONFIG_DRAFTS_KEY,
  decodeDraftsOrFallback,
  encodeDraftsPayload,
} from "@features/items/item-config-drafts.ts";
import { ITEM_CONFIGS_SEED } from "@features/items/items-mock.ts";
import type { Item, ItemConfig } from "@features/items/items-model.ts";
import {
  createConfig as createConfigFn,
  deleteConfig as deleteConfigFn,
  duplicateConfig as duplicateConfigFn,
  type MutationError,
  type MutationResult,
} from "@features/items/items-mutations.ts";
import {
  deleteItem as deleteItemFn,
  upsertItem as upsertItemFn,
  type UpsertItemArgs,
} from "@features/items/items-item-mutations.ts";

export interface ItemDraftsState {
  readonly configs: ReadonlyArray<ItemConfig>;
  readonly hydrated: boolean;
  readonly writeInFlight: boolean;
  readonly lastError: MutationError | null;
  hydrate(): Promise<void>;
  resetError(): void;
  createConfig(args: { name: string; id: string }): Promise<MutationResult>;
  duplicateConfig(sourceId: string, args: { name: string; id: string }): Promise<MutationResult>;
  deleteConfig(id: string): Promise<MutationResult<{ id: string }>>;
  upsertItem(configId: string, args: UpsertItemArgs): Promise<MutationResult<Item>>;
  deleteItem(configId: string, itemId: string): Promise<MutationResult>;
}

let hydrating: Promise<void> | null = null;

function persistDrafts(configs: ReadonlyArray<ItemConfig>, hydrated: boolean): void {
  // Don't persist before hydration — would clobber stored drafts with
  // the seed if a mutation lands in the hydrate window.
  if (!hydrated) return;
  const store = cachedAdminKvStore();
  if (store == null) return;
  void store.setJSON(ITEM_CONFIG_DRAFTS_KEY, encodeDraftsPayload(configs));
}

export const useItemDraftsStore = create<ItemDraftsState>((set, get) => {
  // Apply a pure mutation against the current drafts, commit + persist on
  // success, surface the error otherwise. `writeInFlight` brackets the
  // (synchronous) batch so the Items tab can disable submit buttons.
  const runMutation = <T,>(
    apply: (current: ReadonlyArray<ItemConfig>, now: number) => MutationResult<T>,
  ): Promise<MutationResult<T>> => {
    set({ writeInFlight: true, lastError: null });
    try {
      const result = apply(get().configs, Date.now());
      if (!result.ok) {
        set({ lastError: result.error });
        return Promise.resolve(result);
      }
      set({ configs: result.configs });
      persistDrafts(result.configs, get().hydrated);
      return Promise.resolve(result);
    } finally {
      set({ writeInFlight: false });
    }
  };

  return {
    configs: ITEM_CONFIGS_SEED,
    hydrated: false,
    writeInFlight: false,
    lastError: null,

    hydrate: async () => {
      if (get().hydrated) return;
      if (hydrating != null) return hydrating;
      hydrating = (async () => {
        const store = await getAdminKvStore();
        if (store == null) {
          set({ hydrated: true });
          return;
        }
        try {
          const raw = await store.getJSON<unknown>(ITEM_CONFIG_DRAFTS_KEY);
          set({ configs: decodeDraftsOrFallback(raw, ITEM_CONFIGS_SEED) });
        } catch (caught) {
          console.warn("[items] draft hydrate failed", caught);
          // Degrades the Items tab to seed-only — the admin's prior
          // edits vanish, so this is a real bug worth capturing.
          captureError(caught, { subsystem: "item-configs", op: "hydrate" });
        } finally {
          set({ hydrated: true });
        }
      })();
      return hydrating;
    },

    resetError: () => set({ lastError: null }),

    createConfig: (args) => runMutation((current, now) => createConfigFn(current, args, now)),
    duplicateConfig: (sourceId, args) =>
      runMutation((current, now) => duplicateConfigFn(current, sourceId, args, now)),
    deleteConfig: (id) => runMutation((current) => deleteConfigFn(current, id)),
    upsertItem: (configId, args) =>
      runMutation((current, now) => upsertItemFn(current, configId, args, now)),
    deleteItem: (configId, itemId) =>
      runMutation((current, now) => deleteItemFn(current, configId, itemId, now)),
  };
});

/** Triggers draft hydration on mount. Returns nothing — read slices via
 * `useItemDraftsStore(selector)` at the call site. */
export function useHydrateItemDrafts(): void {
  const hydrate = useItemDraftsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
}
