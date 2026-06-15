// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";

import { cachedAdminKvStore, getAdminKvStore } from "@shared/store/admin-kv.ts";

/**
 * Per-id cache of a verified report secret: `{ id, passkey }`. Once a report
 * decrypts with a secret, the device remembers it so revisiting auto-unlocks
 * instead of re-prompting. Each call to {@link createReportPasskeyCache} mints
 * an independent store/storage namespace — processor-group passkeys and
 * per-terminal passcodes never share an entry.
 *
 * Lives ONLY in the operator's host KV (`admin-kv`) — the same trust boundary
 * as the config cache. Never on-chain, never in the clear off-device.
 */
export interface CachedReportPasskey {
  readonly id: string;
  readonly passkey: string;
  /** ISO timestamp of the unlock that wrote this entry. */
  readonly cachedAt: string;
}

interface StoredPayloadV1 {
  readonly version: 1;
  readonly passkeys: Record<string, CachedReportPasskey>;
}

export interface ReportPasskeyCacheState {
  readonly passkeys: ReadonlyMap<string, CachedReportPasskey>;
  readonly hydrated: boolean;
  hydrate(): Promise<void>;
  getPasskey(id: string): string | null;
  savePasskey(id: string, passkey: string): void;
  /**
   * Drop the cached secret this device holds for an id. No-op if absent.
   */
  removePasskey(id: string): void;
}

export interface ReportPasskeyCache {
  readonly useStore: UseBoundStore<StoreApi<ReportPasskeyCacheState>>;
  readonly useCache: () => ReportPasskeyCacheState;
}

export function createReportPasskeyCache(storageKey: string, warnLabel: string): ReportPasskeyCache {
  let hydrating: Promise<void> | null = null;

  function encode(passkeys: ReadonlyMap<string, CachedReportPasskey>): StoredPayloadV1 {
    const out: Record<string, CachedReportPasskey> = {};
    for (const [id, entry] of passkeys) out[id] = entry;
    return { version: 1, passkeys: out };
  }

  function decode(raw: unknown): Map<string, CachedReportPasskey> {
    const out = new Map<string, CachedReportPasskey>();
    if (raw == null || typeof raw !== "object") return out;
    const obj = raw as { version?: unknown; passkeys?: unknown };
    if (obj.version !== 1 || obj.passkeys == null || typeof obj.passkeys !== "object") return out;
    for (const [id, value] of Object.entries(obj.passkeys as Record<string, unknown>)) {
      if (id.length === 0 || value == null || typeof value !== "object") continue;
      const c = value as Partial<CachedReportPasskey>;
      if (typeof c.id !== "string" || typeof c.passkey !== "string" || typeof c.cachedAt !== "string") {
        continue;
      }
      out.set(id, { id: c.id, passkey: c.passkey, cachedAt: c.cachedAt });
    }
    return out;
  }

  function persist(next: ReadonlyMap<string, CachedReportPasskey>): void {
    const store = cachedAdminKvStore();
    if (store == null) return;
    void store.setJSON(storageKey, encode(next));
  }

  const useStore = create<ReportPasskeyCacheState>((set, get) => ({
    passkeys: new Map(),
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
          const raw = await store.getJSON<unknown>(storageKey);
          set({ passkeys: decode(raw) });
        } catch (caught) {
          console.warn(`${warnLabel} hydrate failed`, caught);
        } finally {
          set({ hydrated: true });
        }
      })();
      return hydrating;
    },

    getPasskey: (id) => get().passkeys.get(id)?.passkey ?? null,

    savePasskey: (id, passkey) => {
      const next = new Map(get().passkeys);
      next.set(id, { id, passkey, cachedAt: new Date().toISOString() });
      set({ passkeys: next });
      persist(next);
    },

    removePasskey: (id) => {
      const current = get().passkeys;
      if (!current.has(id)) return;
      const next = new Map(current);
      next.delete(id);
      set({ passkeys: next });
      persist(next);
    },
  }));

  function useCache(): ReportPasskeyCacheState {
    const hydrate = useStore((s) => s.hydrate);
    useEffect(() => {
      void hydrate();
    }, [hydrate]);
    return useStore();
  }

  return { useStore, useCache };
}
