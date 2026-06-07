import { afterEach, describe, expect, it, vi } from "vitest";
import type * as HostPackage from "@/sdk";

// Stable test doubles for the chain config resolved from SELECTED_NETWORK.
const TEST_GENESIS = "0xtest000000000000000000000000000000000000000000000000000000000000" as const;
const TEST_WS = "wss://test.example.com";

const unsafeApi = { kind: "unsafe-api" };
const rawClient = {
  getUnsafeApi: vi.fn(() => unsafeApi),
  destroy: vi.fn(),
};

const getOrCreateClient = vi.fn(() => rawClient);
const resetClientCache = vi.fn();
const isInHost = vi.fn<() => boolean>(() => false);

vi.mock("@shared/chain/host-connection.ts", () => ({
  isInHost,
  detectHostEnvironment: () => (isInHost() ? "web-iframe" : "standalone"),
  isDevStandalone: () => false,
  connectToHost: vi.fn(),
  getAccountsProvider: vi.fn(),
  isHostConnected: vi.fn(() => false),
}));
vi.mock("@/sdk", async (importOriginal) => {
  const orig = await importOriginal<typeof HostPackage>();
  return {
    ...orig,
    getOrCreateClient,
    resetClientCache,
    resolveNetwork: () => ({
      key: "paseo-next-v2",
      displayName: "Test",
      isTestnet: true,
      mainChain: { genesisHash: TEST_GENESIS, wsUrl: TEST_WS },
      bulletinChain: null,
      peopleChain: null,
      ipfsGateway: "",
      nativeToken: { symbol: "PAS", decimals: 10 },
    }),
  };
});
vi.mock("@shared/config", () => ({
  envConfig: {
    contracts: { merchantRegistryAddress: "" },
    host: {
      productDotNs: "w3spayadmin.dot",
      productDerivationIndex: 0,
    },
    chain: {
      network: "paseo-next-v2",
      readOnlyOrigin: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    },
    token: {
      symbol: "CASH",
      decimals: 6,
      assetId: 50000413n,
      parachainId: 1500,
      palletInstance: 50,
      location: {
        parents: 1,
        interior: {
          type: "X3",
          value: [
            { type: "Parachain", value: 1500 },
            { type: "PalletInstance", value: 50 },
            { type: "GeneralIndex", value: 50000413n },
          ],
        },
      },
    },
  },
}));

// Deferred import: the client module must observe the provider/config mocks above.
const { useMainClient, resetMainClient } = await import("@shared/chain/client.ts");

afterEach(() => {
  resetMainClient();
  vi.clearAllMocks();
  isInHost.mockReturnValue(false);
});

describe("useMainClient — provider branch", () => {
  it("routes through the host provider (transport: auto) in host mode", () => {
    isInHost.mockReturnValue(true);

    const main = useMainClient();

    // `useMainClient` is host-routed ("auto"): reads and the gas-
    // estimation dry-run go through the host bridge so the read path
    // works inside the mobile sandbox. Inclusion tracking for writes
    // doesn't depend on a working chainHead follow here — the
    // contract-state polling oracle in `watch-transaction.ts` resolves
    // the watcher when the host follow can't deliver
    // `txBestBlocksState`.
    expect(getOrCreateClient).toHaveBeenCalledWith(TEST_GENESIS, TEST_WS, isInHost, "auto");
    expect(main.client).toBe(rawClient);
    expect(main.unsafeApi).toBe(unsafeApi);
  });

  it("falls through to direct WS when standalone (transport: auto resolves to WS outside host)", () => {
    isInHost.mockReturnValue(false);

    const main = useMainClient();

    expect(getOrCreateClient).toHaveBeenCalledWith(TEST_GENESIS, TEST_WS, isInHost, "auto");
    expect(main.client).toBe(rawClient);
  });

  it("delegates caching to the shared host client cache", () => {
    isInHost.mockReturnValue(false);

    const a = useMainClient();
    const b = useMainClient();

    expect(a).toStrictEqual(b);
    expect(getOrCreateClient).toHaveBeenCalledTimes(2);
  });

  it("delegates reset to the shared host client cache", () => {
    resetMainClient();

    expect(resetClientCache).toHaveBeenCalledTimes(1);
  });
});
