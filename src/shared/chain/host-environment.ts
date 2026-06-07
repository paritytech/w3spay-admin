/**
 * Async runtime/storage abstraction over the host container.
 *
 * Three layers, picked at construction time:
 *
 *   1. **Host KV** — when running inside a Polkadot host container,
 *      persist through host-api-wrapper's `hostLocalStorage` so values
 *      follow the user across host instances.
 *   2. **Browser `localStorage`** — outside a host, or when the host
 *      KV is unavailable, fall back to the page-scoped storage. Survives
 *      reloads, scoped per origin.
 *   3. **In-memory `Map`** — last-resort fallback when both of the above
 *      throw (private-browsing, WKWebView during early startup). Values
 *      live only for the page session.
 *
 * Every method is async because the host KV is — keeping the surface
 * uniform means callers don't branch on which backend they got.
 */

import { isInHost } from "@shared/chain/host";
import { hostLocalStorage } from "@/shared/chain/host";

/** Host KV handle the SDK exposes (aliased to keep `createHostKvStore` typed). */
type HostLocalStorage = typeof hostLocalStorage;

export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

export type RuntimeEnvironment = "host" | "browser";

export async function detectRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  return isInHost() ? "host" : "browser";
}

/**
 * Build a KV store scoped by `prefix`. Inside a host with KV access the
 * returned store writes through to the host; otherwise it transparently
 * falls back to localStorage with an in-memory safety net.
 */
export async function createTerminalStore(prefix = "w3spayadmin"): Promise<KvStore> {
  if (isInHost()) {
    return createHostKvStore(hostLocalStorage, prefix);
  }
  return createBrowserKvStore(prefix);
}

function createHostKvStore(hostKv: HostLocalStorage, prefix: string): KvStore {
  const keyFor = (key: string) => `${prefix}:${key}`;
  return {
    async get(key) {
      try {
        return await hostKv.readString(keyFor(key));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        await hostKv.writeString(keyFor(key), value);
      } catch {
        // Host KV writes can fail under quota / permission churn — surface
        // as a silent no-op since the only consumer is preference state.
      }
    },
    async remove(key) {
      try {
        await hostKv.clear(keyFor(key));
      } catch {
        // See above.
      }
    },
    async getJSON<T>(key: string) {
      try {
        return (await hostKv.readJSON(keyFor(key))) as T;
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      try {
        await hostKv.writeJSON(keyFor(key), value);
      } catch {
        // See `set`.
      }
    },
  };
}

function createBrowserKvStore(prefix: string): KvStore {
  const keyFor = (key: string) => `${prefix}:${key}`;
  const memory = new Map<string, string>();
  const getRaw = async (key: string): Promise<string | null> => {
    const storageKey = keyFor(key);
    try {
      return window.localStorage.getItem(storageKey) ?? memory.get(storageKey) ?? null;
    } catch {
      return memory.get(storageKey) ?? null;
    }
  };
  const setRaw = async (key: string, value: string): Promise<void> => {
    const storageKey = keyFor(key);
    memory.set(storageKey, value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      // WKWebView storage can be unavailable during early product startup;
      // the in-memory cache picks up the slack until storage comes online.
    }
  };
  return {
    async get(key) {
      return getRaw(key);
    },
    async set(key, value) {
      await setRaw(key, value);
    },
    async remove(key) {
      const storageKey = keyFor(key);
      memory.delete(storageKey);
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Memory fallback is already cleared.
      }
    },
    async getJSON<T>(key: string) {
      const raw = await getRaw(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await setRaw(key, JSON.stringify(value));
    },
  };
}
