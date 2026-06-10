// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect } from "react";
import { create } from "zustand";

import { cachedAdminKvStore, getAdminKvStore } from "@shared/store/admin-kv.ts";
import type { ProcessorTerminalForm } from "../payment-processor-model.ts";

/**
 * Per-group cache of the last config this device published or unlocked:
 * `{ passkey, terminals, profile }`. Re-opening a config it already holds
 * skips the passkey gate entirely — the unlock-decrypt flow is only for
 * devices that have never seen the group's config.
 *
 * Lives ONLY in the operator's host KV (`admin-kv`) — the same trust boundary
 * as the per-terminal PEMs in the terminal-secrets store and the processor's
 * own locally-stored unlock creds. Never on-chain, never in the clear off-device.
 */
export const PROCESSOR_CONFIG_CACHE_KEY = "payment-processor-config-cache/v1" as const;

export interface CachedProcessorConfig {
  readonly groupId: string;
  readonly merchantName: string;
  readonly merchantId: string;
  /** The group passkey — what the processor enters at its unlock gate. */
  readonly passkey: string;
  readonly terminals: ProcessorTerminalForm[];
  /** ISO timestamp of the publish/unlock that wrote this entry. */
  readonly cachedAt: string;
}

interface StoredPayloadV1 {
  readonly version: 1;
  readonly configs: Record<string, CachedProcessorConfig>;
}

export interface ProcessorConfigCacheState {
  readonly configs: ReadonlyMap<string, CachedProcessorConfig>;
  readonly hydrated: boolean;
  hydrate(): Promise<void>;
  getConfig(groupId: string): CachedProcessorConfig | null;
  saveConfig(config: CachedProcessorConfig): void;
  /**
   * Drop the per-group cache entry this device has on file. Called when the
   * registry record is removed (e.g. via `removeProcessorConfig`) so the next
   * visit to that group's editor forces the passkey gate again instead of
   * silently re-using stale terminals. No-op if no entry exists.
   */
  removeConfig(groupId: string): void;
}

let hydrating: Promise<void> | null = null;

function encode(configs: ReadonlyMap<string, CachedProcessorConfig>): StoredPayloadV1 {
  const out: Record<string, CachedProcessorConfig> = {};
  for (const [groupId, config] of configs) out[groupId] = config;
  return { version: 1, configs: out };
}

function decodeTerminal(value: unknown): ProcessorTerminalForm | null {
  if (value == null || typeof value !== "object") return null;
  const t = value as Partial<ProcessorTerminalForm>;
  if (
    typeof t.terminalId !== "string" ||
    typeof t.label !== "string" ||
    typeof t.payoutAddress !== "string" ||
    typeof t.topicId !== "string" ||
    typeof t.pemFile !== "string"
  ) {
    return null;
  }
  return {
    terminalId: t.terminalId,
    label: t.label,
    payoutAddress: t.payoutAddress,
    topicId: t.topicId,
    pemFile: t.pemFile,
  };
}

function decode(raw: unknown): Map<string, CachedProcessorConfig> {
  const out = new Map<string, CachedProcessorConfig>();
  if (raw == null || typeof raw !== "object") return out;
  const obj = raw as { version?: unknown; configs?: unknown };
  if (obj.version !== 1 || obj.configs == null || typeof obj.configs !== "object") return out;
  for (const [groupId, value] of Object.entries(obj.configs as Record<string, unknown>)) {
    if (groupId.length === 0 || value == null || typeof value !== "object") continue;
    const c = value as Partial<CachedProcessorConfig>;
    if (
      typeof c.groupId !== "string" ||
      typeof c.merchantName !== "string" ||
      typeof c.merchantId !== "string" ||
      typeof c.passkey !== "string" ||
      typeof c.cachedAt !== "string" ||
      !Array.isArray(c.terminals)
    ) {
      continue;
    }
    const terminals = c.terminals.map(decodeTerminal);
    if (terminals.some((t) => t == null)) continue;
    out.set(groupId, {
      groupId: c.groupId,
      merchantName: c.merchantName,
      merchantId: c.merchantId,
      passkey: c.passkey,
      terminals: terminals as ProcessorTerminalForm[],
      cachedAt: c.cachedAt,
    });
  }
  return out;
}

function persist(next: ReadonlyMap<string, CachedProcessorConfig>): void {
  const store = cachedAdminKvStore();
  if (store == null) return;
  void store.setJSON(PROCESSOR_CONFIG_CACHE_KEY, encode(next));
}

export const useProcessorConfigCacheStore = create<ProcessorConfigCacheState>((set, get) => ({
  configs: new Map(),
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
        const raw = await store.getJSON<unknown>(PROCESSOR_CONFIG_CACHE_KEY);
        set({ configs: decode(raw) });
      } catch (caught) {
        console.warn("[payment-processors] config-cache hydrate failed", caught);
      } finally {
        set({ hydrated: true });
      }
    })();
    return hydrating;
  },

  getConfig: (groupId) => get().configs.get(groupId) ?? null,

  saveConfig: (config) => {
    const next = new Map(get().configs);
    next.set(config.groupId, config);
    set({ configs: next });
    persist(next);
  },

  removeConfig: (groupId) => {
    const current = get().configs;
    if (!current.has(groupId)) return;
    const next = new Map(current);
    next.delete(groupId);
    set({ configs: next });
    persist(next);
  },
}));

export function useProcessorConfigCache(): ProcessorConfigCacheState {
  const hydrate = useProcessorConfigCacheStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return useProcessorConfigCacheStore();
}