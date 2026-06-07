/**
 * PAPI client wrappers for w3spay-admin.
 *
 * Thin composition over `@/sdk`'s `getOrCreateClient` cache.
 * Mirrors `apps/w3spay/src/host/client.ts` exactly — w3spay (read) and
 * admin (write) MUST share this transport so the on-chain merchant
 * registry deployed by admin is the same one read by w3spay.
 *
 * `isInHost` is forwarded from `./host-connection.ts` so tests can mock
 * the local module to flip provider strategy without reaching into the
 * shared package.
 */

import {
  getOrCreateClient,
  resetClientCache,
  resolveNetwork,
} from "@shared/api/host";

import { envConfig } from "@shared/config.ts";

/**
 * Get (or create) the shared Paseo Asset Hub Next PAPI client. Idempotent;
 * underlying client is cached by genesis hash.
 *
 * Forced WS-direct (`transport: "ws"`): the host's `createPapiProvider`
 * advertises support for Paseo Asset Hub Next but does NOT establish a
 * working chainHead follow, so a contract write broadcasts (the tx lands on
 * chain) but `txBestBlocksState` never arrives and the watcher hangs at
 * "broadcasting". Going straight to the public WS gives PAPI a working follow
 * so tx tracking resolves. Signing still routes through the host
 * product-account signer (see `use-product-account.ts`); only chain RPC
 * bypasses the host. Mirrors the working t3rminal app
 * (`apps/t3rminal-v1/lib/host/provider.ts`).
 */
export function useMainClient() {
  const network = resolveNetwork(envConfig.chain.network);
  const genesis = network.mainChain.genesisHash as `0x${string}`;
  const client = getOrCreateClient(genesis, network.mainChain.wsUrl);
  return {
    client,
    unsafeApi: client.getUnsafeApi(),
  };
}

/**
 * Get (or create) the PAPI client for the configured People-system parachain
 * (Paseo Individuality / "Paseo People Next" on paseo-next-v2) — the chain
 * where the CASH (pUSD) foreign asset lives, keyed in `pallet-assets` by its
 * XCM Location (`Assets.Account(<location>, <ss58>)`). Returns `null` when the
 * active network has no people chain (blank genesis), so callers (the CASH
 * balance lookup in `lib/contract/token-balance.ts`) must guard.
 *
 * Like `useMainClient`, reads route through the host bridge in host mode and
 * fall back to a direct WS connection standalone ("auto"). Despite the `use`
 * prefix this is NOT a React hook — it's a process-wide singleton getter.
 */
export function usePeopleClient() {
  const network = resolveNetwork(envConfig.chain.network);
  const people = network.peopleChain;
  if (!people || people.genesisHash === "") return null;
  const client = getOrCreateClient(
    people.genesisHash as `0x${string}`,
    people.wsUrl,
  );
  return {
    client,
    unsafeApi: client.getUnsafeApi(),
  };
}

/** Test/HMR only — drop all cached clients so the next call rebuilds. */
export const resetMainClient = resetClientCache;
