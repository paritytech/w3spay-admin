// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { envConfig } from "@/config.ts";
import { resolveNetwork } from "@shared/chain/host";
import {
  isInHost,
} from "@shared/chain/host-connection.ts";
import {
  checkHostChainSupport,
  probeIpfsGateway,
  requestRemotePermission,
  type ChainSupport,
  type RemotePermissionOutcome,
} from "@features/session/permissions.ts";

export interface HostPermissionsSnapshot {
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: RemotePermissionOutcome | null;
}




export async function resolveHostPermissions(
  genesisHash: `0x${string}`,
): Promise<HostPermissionsSnapshot> {
  if (!isInHost()) {
    return { hostChainSupport: null, chainSubmitGrant: null };
  }

  const hostChainSupport = await checkHostChainSupport(genesisHash);
  const chainSubmitGrant = await requestRemotePermission("ChainSubmit");
  if (hostChainSupport.kind === "unsupported") {
    console.info(
      `[w3spay-admin] host does not advertise chain ${genesisHash}; using direct WS`,
    );
  }

  void probeIpfsGateway(resolveNetwork(envConfig.chain.network).ipfsGateway);
  return { hostChainSupport, chainSubmitGrant };
}
