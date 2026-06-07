/**
 * Session-level host permissions probe.
 *
 * Composes the pure host-API wrappers (`checkHostChainSupport`,
 * `requestRemotePermission` from `permissions.ts`) with host detection
 * (`isInHost`) into the snapshot the session store stores. Kept separate
 * from `permissions.ts` so that module stays a thin host-API wrapper with
 * no `host-connection`/`config` import edge — `permissions.test.ts` can
 * exercise it with only `@/sdk/host` mocked.
 *
 * Extracted from the former `useHostPermissions` hook so the session
 * store's `retryHostPermissions` action can run the same probe without a
 * React effect.
 */

import type { ReadyAdminAccount } from "@features/session/account.ts";
import { isInHost } from "@shared/chain/host-connection.ts";
import {
  checkHostChainSupport,
  requestRemotePermission,
  type ChainSupport,
  type RemotePermissionOutcome,
} from "@features/session/permissions.ts";

/**
 * Snapshot of the host's chain capabilities for a resolved account. Both
 * fields are `null` outside a host (or before an account resolves) —
 * standalone sessions read/write over direct WS and never gate.
 */
export interface HostPermissionsSnapshot {
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: RemotePermissionOutcome | null;
}

export async function resolveHostPermissions(
  genesisHash: `0x${string}`,
  readyAccount: ReadyAdminAccount | null,
): Promise<HostPermissionsSnapshot> {
  if (!isInHost() || readyAccount == null) {
    return { hostChainSupport: null, chainSubmitGrant: null };
  }
  const [hostChainSupport, chainSubmitGrant] = await Promise.all([
    checkHostChainSupport(genesisHash),
    requestRemotePermission("ChainSubmit"),
  ]);
  if (hostChainSupport.kind === "unsupported") {
    console.info(
      `[w3spay-admin] host does not advertise chain ${genesisHash}; using direct WS`,
    );
  }
  return { hostChainSupport, chainSubmitGrant };
}
