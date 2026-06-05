/**
 * Local restaurant records as a Zustand store (host-KV / localStorage
 * backed). Replaces the `useRestaurants` hook.
 *
 * Persistence is NOT zustand's `persist` middleware: the host KV is
 * async, while the new-restaurant flow navigates away in the same commit
 * it writes — a deferred/async persist would be torn down before it
 * fired. So this store keeps the previous semantics exactly: an explicit
 * async `hydrate()` (read once, incl. the one-time `merchant-profiles/v1`
 * legacy migration) plus synchronous write-through on every mutation
 * (`BrowserKvStore.setJSON` commits to `localStorage` before yielding).
 *
 * The KV handle + hydrate guard are module singletons. `useRestaurants()`
 * is the consumer hook: it kicks `hydrate()` on mount and returns the
 * `UseRestaurantsResult` contract.
 */

import { useEffect } from "react";
import { create } from "zustand";

import { cachedAdminKvStore, getAdminKvStore } from "@shared/store/admin-kv.ts";
import {
  LEGACY_MERCHANT_PROFILES_KEY,
  RESTAURANTS_KEY,
  decodeLegacyMerchantProfilesPayload,
  decodeRestaurantsPayload,
  encodeRestaurantsPayload,
  type Restaurant,
  type UseRestaurantsResult,
} from "@features/restaurants/restaurants.ts";

export interface RestaurantsState extends UseRestaurantsResult {
  /** Read KV once (with legacy migration). Idempotent across calls. */
  hydrate(): Promise<void>;
}

let hydrating: Promise<void> | null = null;

function persist(next: ReadonlyMap<string, Restaurant>): void {
  // Synchronous-enough: BrowserKvStore.setJSON runs localStorage.setItem
  // before yielding its (ignored) promise, so the write lands before the
  // navigate-away teardown. Host KV is genuinely async but the admin
  // never reads it back within the same commit.
  const store = cachedAdminKvStore();
  if (store == null) return;
  void store.setJSON(RESTAURANTS_KEY, encodeRestaurantsPayload(next));
}

export const useRestaurantsStore = create<RestaurantsState>((set, get) => ({
  restaurants: new Map(),
  hydrated: false,

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
        const raw = await store.getJSON<unknown>(RESTAURANTS_KEY);
        const decoded = decodeRestaurantsPayload(raw);
        if (decoded.size === 0) {
          // First boot after the rename — fold any legacy
          // `merchant-profiles/v1` entries forward and persist them
          // under the new key so later boots skip the legacy read.
          let legacyMap: ReadonlyMap<string, Restaurant> = new Map();
          try {
            const legacy = await store.getJSON<unknown>(LEGACY_MERCHANT_PROFILES_KEY);
            legacyMap = decodeLegacyMerchantProfilesPayload(legacy);
          } catch (caught) {
            console.warn("[restaurants] legacy migration read failed", caught);
          }
          set({ restaurants: legacyMap });
          if (legacyMap.size > 0) {
            void store.setJSON(RESTAURANTS_KEY, encodeRestaurantsPayload(legacyMap));
          }
        } else {
          set({ restaurants: decoded });
        }
      } catch (caught) {
        console.warn("[restaurants] hydrate failed", caught);
      } finally {
        set({ hydrated: true });
      }
    })();
    return hydrating;
  },

  getRestaurant: (id) => get().restaurants.get(id) ?? null,

  upsertRestaurant: (restaurant) => {
    const next = new Map(get().restaurants);
    next.set(restaurant.id, restaurant);
    set({ restaurants: next });
    persist(next);
  },

  removeRestaurant: (id) => {
    const current = get().restaurants;
    if (!current.has(id)) return;
    const next = new Map(current);
    next.delete(id);
    set({ restaurants: next });
    persist(next);
  },
}));

/**
 * Consumer hook: triggers hydration on mount and returns the
 * `UseRestaurantsResult` slice. Subscribes to the whole store — callers
 * (the Restaurants screen, ConfigureT3rminal) use every field.
 */
export function useRestaurants(): UseRestaurantsResult {
  const hydrate = useRestaurantsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return useRestaurantsStore();
}
