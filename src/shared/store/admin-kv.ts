/**
 * Single admin-scoped KV store, shared by the local-persisted Zustand
 * stores (restaurants, t3rminal-assignments, item-config drafts).
 *
 * `createTerminalStore` is async (host KV) and races on early mobile
 * boot, so we cache the resolved handle once. `getAdminKvStore()` is the
 * async accessor (await it in `hydrate()`); `cachedAdminKvStore()` is the
 * synchronous read for write-through mutations — by the time a mutation
 * fires the store has hydrated, so the cached handle is present.
 */

import { createTerminalStore, type KvStore } from "@shared/utils/host-environment.ts";

const KV_PREFIX = "w3spay-admin";

let cached: KvStore | null = null;
let creating: Promise<KvStore | null> | null = null;

export function getAdminKvStore(): Promise<KvStore | null> {
  if (cached != null) return Promise.resolve(cached);
  if (creating != null) return creating;
  creating = createTerminalStore(KV_PREFIX)
    .then((store) => {
      cached = store;
      return store;
    })
    .catch((caught) => {
      console.warn("[admin-kv] store init failed", caught);
      return null;
    });
  return creating;
}

/** Synchronous read of the cached handle (null before first hydrate). */
export function cachedAdminKvStore(): KvStore | null {
  return cached;
}

/** Test/HMR only — drop the cached store so the next call rebuilds. */
export function resetAdminKvStore(): void {
  cached = null;
  creating = null;
}
