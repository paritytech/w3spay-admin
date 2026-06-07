/**
 * `usePeopleClient` — provider branch.
 *
 * The CASH balance read behind the Balances tab MUST talk to the people-system
 * parachain (where the foreign asset lives), not the main Asset Hub chain.
 * These tests pin that `usePeopleClient` resolves its endpoint from
 * `NetworkConfig.peopleChain` — guarding the regression that repointed it at
 * `mainChain` (which still lurks in `apps/w3spay/src/host/client.ts`).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Sdk from "@/sdk";
// Static import: `vi.mock` is hoisted above imports by vitest, and the shared
// state below is created with `vi.hoisted`, so the mocks are active before
// `@shared/chain/client.ts` is evaluated — no `await import()` needed.
import { usePeopleClient } from "@shared/chain/client.ts";

const m = vi.hoisted(() => {
  const peopleEndpoint = { wsUrl: "wss://people.example", genesisHash: "0xpeoplegenesis" };
  const mainEndpoint = { wsUrl: "wss://main.example", genesisHash: "0xmaingenesis" };
  const unsafeApi = { kind: "unsafe-api" };
  const rawClient = { getUnsafeApi: vi.fn(() => unsafeApi), destroy: vi.fn() };
  return {
    peopleEndpoint,
    mainEndpoint,
    unsafeApi,
    rawClient,
    getOrCreateClient: vi.fn(() => rawClient),
    resetClientCache: vi.fn(),
    isInHost: vi.fn<() => boolean>(() => false),
    // Mutable so a test can simulate "no people chain" / placeholder entry.
    peopleChainRef: {
      current: peopleEndpoint as { wsUrl: string; genesisHash: string } | null,
    },
  };
});

vi.mock("@shared/chain/host-connection.ts", () => ({
  isInHost: m.isInHost,
  detectHostEnvironment: () => (m.isInHost() ? "web-iframe" : "standalone"),
  isDevStandalone: () => false,
  connectToHost: vi.fn(),
  getAccountsProvider: vi.fn(),
  isHostConnected: vi.fn(() => false),
}));

vi.mock("@/sdk", async (importOriginal) => {
  const orig = await importOriginal<typeof Sdk>();
  return {
    ...orig,
    getOrCreateClient: m.getOrCreateClient,
    resetClientCache: m.resetClientCache,
    resolveNetwork: () => ({
      key: "paseo-next-v2",
      displayName: "Test",
      isTestnet: true,
      mainChain: m.mainEndpoint,
      bulletinChain: null,
      peopleChain: m.peopleChainRef.current,
      ipfsGateway: "",
      nativeToken: { symbol: "PAS", decimals: 10 },
    }),
  };
});

vi.mock("@shared/config", () => ({
  envConfig: { chain: { network: "paseo-next-v2", readOnlyOrigin: "" } },
}));

afterEach(() => {
  vi.clearAllMocks();
  m.isInHost.mockReturnValue(false);
  m.peopleChainRef.current = m.peopleEndpoint;
});

describe("usePeopleClient — provider branch", () => {
  it("builds the client from peopleChain, not mainChain", () => {
    const res = usePeopleClient();

    expect(m.getOrCreateClient).toHaveBeenCalledWith(
      m.peopleEndpoint.genesisHash,
      m.peopleEndpoint.wsUrl,
      m.isInHost,
      "auto",
    );
    // Guard the exact regression class: never read the balance off the main
    // (Asset Hub) chain, which holds 0 of the foreign asset.
    const [genesis, ws] = m.getOrCreateClient.mock.calls[0] as [string, string, unknown, unknown];
    expect(genesis).not.toBe(m.mainEndpoint.genesisHash);
    expect(ws).not.toBe(m.mainEndpoint.wsUrl);
    expect(res?.unsafeApi).toBe(m.unsafeApi);
  });

  it("returns null when the active network has no people chain", () => {
    m.peopleChainRef.current = null;

    expect(usePeopleClient()).toBeNull();
    expect(m.getOrCreateClient).not.toHaveBeenCalled();
  });

  it("returns null when the people chain genesis is still a blank placeholder", () => {
    m.peopleChainRef.current = { wsUrl: "wss://people.example", genesisHash: "" };

    expect(usePeopleClient()).toBeNull();
    expect(m.getOrCreateClient).not.toHaveBeenCalled();
  });
});
