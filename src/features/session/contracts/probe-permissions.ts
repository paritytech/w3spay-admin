// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  claimResourceAllowances,
  isInHost,
} from "@shared/chain/host-connection.ts";
import {
  checkHostChainSupport,
  requestRemotePermission,
  type ChainSupport,
  type RemotePermissionOutcome,
} from "@features/session/permissions.ts";
import { getAdminKvStore } from "@shared/store/admin-kv.ts";

export interface HostPermissionsSnapshot {
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: RemotePermissionOutcome | null;
}

/** `SmartContractAllowance:0` is REQUIRED to sign `Revive.call` — without it the host returns `CreateTransactionErr::PermissionDenied`. `AutoSigning` is best-effort. */


const GRANTED_ALLOWANCES_KEY = "resource-allowances-granted:v1";

async function loadGrantedAllowances(): Promise<boolean> {
  const store = await getAdminKvStore();
  if (store === null) return false;
  const stored = await store.get(GRANTED_ALLOWANCES_KEY);
  if (stored !== "true") return false;
  return true;
}

async function persistGrantedAllowances(
  granted: boolean
): Promise<void> {
  const store = await getAdminKvStore();
  if (store === null) return;
  await store.set(GRANTED_ALLOWANCES_KEY, `${granted}`);
}

export async function resolveHostPermissions(
  genesisHash: `0x${string}`,
): Promise<HostPermissionsSnapshot> {
  if (!isInHost()) {
    return { hostChainSupport: null, chainSubmitGrant: null };
  }

  const hostChainSupport = await checkHostChainSupport(genesisHash);
  const chainSubmitGrant = await requestRemotePermission("ChainSubmit");

  const alreadyGranted = await loadGrantedAllowances();
  if (alreadyGranted) {
    console.info("Already granted required resource allowances");
    return { hostChainSupport, chainSubmitGrant };
  }
  console.info("Already granted allowances", alreadyGranted);
  const outcome = await claimResourceAllowances();
  console.info("Claim resource allowances outcome:", outcome);
  
  if (!outcome) {
    console.warn(
      "[permissions] failed to claim required resource allowances; host interactions may not work as expected",
    );
  }

  if (hostChainSupport.kind === "unsupported") {
    console.info(
      `[w3spay-admin] host does not advertise chain ${genesisHash}; using direct WS`,
    );
  }
  console.info("Persisting granted allowances", alreadyGranted);
  await persistGrantedAllowances(outcome);

  return { hostChainSupport, chainSubmitGrant };
}
