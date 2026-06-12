import { afterEach, describe, expect, it, vi } from "vitest";

interface MockProvider {
  readonly kind: "host" | "ws";
  readonly genesis?: `0x${string}`;
  readonly url?: string;
  readonly ws?: MockProvider;
}

interface MockClient {
  readonly provider: MockProvider;
  readonly destroy: () => void;
}

const mocks = vi.hoisted(() => {
  return {
    createPapiProvider: vi.fn((genesis: `0x${string}`, ws: MockProvider): MockProvider => ({
      kind: "host",
      genesis,
      ws,
    })),
    getWsProvider: vi.fn((url: string): MockProvider => ({ kind: "ws", url })),
    createClient: vi.fn((provider: MockProvider): MockClient => ({
      provider,
      destroy: vi.fn(),
    })),
  };
});

vi.mock("@novasamatech/host-api-wrapper", () => ({
  createPapiProvider: mocks.createPapiProvider,
}));

vi.mock("@polkadot-api/ws-provider", () => ({
  getWsProvider: mocks.getWsProvider,
}));

vi.mock("polkadot-api", () => ({
  createClient: mocks.createClient,
}));

import {
  getCachedClients,
  getChainTransportMode,
  getOrCreateClient,
  rebuildClients,
  resetClientCache,
  setChainTransportMode,
} from "@shared/chain/host/client.ts";

const GENESIS = `0x${"11".repeat(32)}` as `0x${string}`;
const WS_URL = "wss://example.invalid";

afterEach(() => {
  resetClientCache();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("getOrCreateClient", () => {
  it("uses the host provider inside a host by default", () => {
    const client = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;

    expect(getChainTransportMode()).toBe("host");
    expect(client.provider.kind).toBe("host");
    expect(mocks.createPapiProvider).toHaveBeenCalledWith(GENESIS, { kind: "ws", url: WS_URL });
  });

  it("returns the cached client on repeat calls", () => {
    const first = getOrCreateClient(GENESIS, WS_URL, () => true);
    const second = getOrCreateClient(GENESIS, WS_URL, () => true);

    expect(second).toBe(first);
    expect(mocks.createClient).toHaveBeenCalledOnce();
  });

  it("uses the direct ws provider outside a host", () => {
    const client = getOrCreateClient(GENESIS, WS_URL, () => false) as unknown as MockClient;

    expect(client.provider.kind).toBe("ws");
    expect(mocks.createPapiProvider).not.toHaveBeenCalled();
  });
});

describe("setChainTransportMode", () => {
  it("switching to direct-ws drops cached clients and rebuilds on the ws provider", () => {
    const first = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(first.provider.kind).toBe("host");

    setChainTransportMode("direct-ws");
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(getCachedClients()).toHaveLength(0);

    const second = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(second.provider.kind).toBe("ws");
  });

  it("switching back to host restores the host provider", () => {
    setChainTransportMode("direct-ws");
    const direct = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(direct.provider.kind).toBe("ws");

    setChainTransportMode("host");
    expect(direct.destroy).toHaveBeenCalledOnce();

    const restored = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(restored.provider.kind).toBe("host");
  });

  it("is a no-op when the mode is unchanged", () => {
    const client = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;

    setChainTransportMode("host");
    expect(client.destroy).not.toHaveBeenCalled();
    expect(getCachedClients()).toHaveLength(1);
  });

  it("persists the mode and rehydrates it after the in-memory cache resets", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });

    setChainTransportMode("direct-ws");
    expect(store.size).toBe(1);

    rebuildClients();
    const client = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(client.provider.kind).toBe("ws");

    resetClientCache();
    expect(store.size).toBe(0);
    expect(getChainTransportMode()).toBe("host");
  });
});

describe("rebuildClients", () => {
  it("destroys cached clients but keeps the transport mode", () => {
    setChainTransportMode("direct-ws");
    const pinned = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(pinned.provider.kind).toBe("ws");

    rebuildClients();
    expect(pinned.destroy).toHaveBeenCalledOnce();
    expect(getCachedClients()).toHaveLength(0);

    const next = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;
    expect(next.provider.kind).toBe("ws");
    expect(next).not.toBe(pinned);
  });
});
