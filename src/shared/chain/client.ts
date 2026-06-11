// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  getOrCreateClient,
  resetClientCache,
  resolveNetwork,
} from "@shared/chain/host";

import { envConfig } from "@/config.ts";

export function useMainClient() {
  const network = resolveNetwork(envConfig.chain.network);
  const genesis = network.mainChain.genesisHash as `0x${string}`;
  const client = getOrCreateClient(genesis, network.mainChain.wsUrl);
  return {
    client,
    unsafeApi: client.getUnsafeApi(),
  };
}

export function usePeopleClient() {
  const network = resolveNetwork(envConfig.chain.network);
  const people = network.peopleChain;
  if (!people || people.genesisHash === "") return null;
  const client = getOrCreateClient(
    people.genesisHash as `0x${string}`,
    people.wsUrl
  );
  return {
    client,
    unsafeApi: client.getUnsafeApi(),
  };
}

export const resetMainClient = resetClientCache;
