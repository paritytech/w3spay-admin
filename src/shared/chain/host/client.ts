// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { createPapiProvider } from "@novasamatech/host-api-wrapper";
import { getWsProvider } from "@polkadot-api/ws-provider";
import { createClient, type PolkadotClient } from "polkadot-api";

const clientCache = new Map<`0x${string}`, PolkadotClient>();
const directWsChains = new Set<`0x${string}`>();

export function forceDirectWsForChain(genesis: `0x${string}`): void {
  directWsChains.add(genesis);
  const client = clientCache.get(genesis);
  if (client == null) return;
  client.destroy();
  clientCache.delete(genesis);
}

export function getOrCreateClient(
  genesis: `0x${string}`,
  wsFallback: string,
): PolkadotClient {
  let client = clientCache.get(genesis);
  if (!client) {
    const ws = getWsProvider(wsFallback);
    const provider = createPapiProvider(genesis, ws);
    client = createClient(provider);
    clientCache.set(genesis, client);
  }
  return client;
}

/** Test / HMR only — drop all cached clients so the next call rebuilds. */
export function resetClientCache(): void {
  clientCache.forEach((client) => client.destroy());
  clientCache.clear();
  directWsChains.clear();
}
