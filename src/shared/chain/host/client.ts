// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { createPapiProvider } from "@novasamatech/host-api-wrapper";
import { getWsProvider } from "@polkadot-api/ws-provider";
import { createClient, type PolkadotClient } from "polkadot-api";

import { isInHost } from "./connection.ts";

/**
 * How chain reads/subscriptions reach the node when running inside a host:
 * `"host"` routes through the host bridge (with the WS endpoint as SDK-level
 * fallback); `"direct-ws"` speaks to the WS endpoint directly — the operator's
 * escape hatch for a host whose chain transport is broken while the page is
 * otherwise healthy. Reads recover; signing still requires the host.
 * Outside a host the mode is ignored — direct WS is the only viable path.
 */
export type ChainTransportMode = "host" | "direct-ws";

export const DEFAULT_TRANSPORT_MODE: ChainTransportMode = "host";

const TRANSPORT_MODE_STORAGE_KEY = "w3spayadmin/chain-transport-mode/v1";

const clientCache = new Map<`0x${string}`, PolkadotClient>();

let transportMode: ChainTransportMode | null = null;

export function getChainTransportMode(): ChainTransportMode {
  if (transportMode == null) {
    try {
      const raw = window.localStorage.getItem(TRANSPORT_MODE_STORAGE_KEY);
      transportMode = raw === "direct-ws" ? "direct-ws" : DEFAULT_TRANSPORT_MODE;
    } catch {
      transportMode = DEFAULT_TRANSPORT_MODE;
    }
  }
  return transportMode;
}

/**
 * Switch the chain transport and drop every cached client so the next
 * acquisition rebuilds it on the selected provider. Persisted per device;
 * a no-op when the mode is unchanged. In-flight reads on destroyed clients
 * reject and recover via the react-query retry/refetch cycle.
 */
export function setChainTransportMode(mode: ChainTransportMode): void {
  if (mode === getChainTransportMode()) return;
  transportMode = mode;
  try {
    window.localStorage.setItem(TRANSPORT_MODE_STORAGE_KEY, mode);
  } catch {
    // Best-effort persistence; the in-memory mode still applies this session.
  }
  rebuildClients();
}

/**
 * Lazily build (and cache, per genesis) the PAPI client for a chain.
 *
 * Inside a host with the `"host"` transport mode the provider routes through
 * the host bridge with `wsFallback` as the SDK-level fallback; outside a host
 * — or in `"direct-ws"` mode — the client speaks directly to `wsFallback`.
 * (`createPapiProvider` throws outside a product environment, so the direct
 * path is also what makes standalone runs viable.)
 */
export function getOrCreateClient(
  genesis: `0x${string}`,
  wsFallback: string,
  inHost: () => boolean = isInHost,
): PolkadotClient {
  let client = clientCache.get(genesis);
  if (!client) {
    const ws = getWsProvider(wsFallback);
    const provider =
      inHost() && getChainTransportMode() === "host" ? createPapiProvider(genesis, ws) : ws;
    client = createClient(provider);
    clientCache.set(genesis, client);
  }
  return client;
}

/** Currently-cached clients, for liveness probing. Never creates one. */
export function getCachedClients(): ReadonlyArray<PolkadotClient> {
  return Array.from(clientCache.values());
}

/**
 * Destroy every cached client so the next acquisition rebuilds it with a
 * fresh provider (and a fresh chainHead follow). Keeps the transport mode —
 * unlike `resetClientCache`, this is a production recovery action, not a
 * full reset.
 */
export function rebuildClients(): void {
  clientCache.forEach((client) => client.destroy());
  clientCache.clear();
}

/** Test / HMR only — drop all cached clients AND the transport-mode override. */
export function resetClientCache(): void {
  rebuildClients();
  transportMode = null;
  try {
    window.localStorage.removeItem(TRANSPORT_MODE_STORAGE_KEY);
  } catch {
    // Storage unavailable (node test env) — the in-memory reset suffices.
  }
}
