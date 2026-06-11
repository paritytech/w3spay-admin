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
  forceDirectWsForChain,
  getOrCreateClient,
  resetClientCache,
} from "@shared/chain/host/client.ts";

const GENESIS = `0x${"11".repeat(32)}` as `0x${string}`;
const WS_URL = "wss://example.invalid";

afterEach(() => {
  resetClientCache();
  vi.clearAllMocks();
});

describe("getOrCreateClient", () => {
  it("uses the host provider inside a host by default", () => {
    const client = getOrCreateClient(GENESIS, WS_URL, () => true) as unknown as MockClient;

    expect(client.provider.kind).toBe("host");
    expect(mocks.createPapiProvider).toHaveBeenCalledWith(GENESIS, { kind: "ws", url: WS_URL });
  });

});
