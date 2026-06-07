/**
 * Host session as a Zustand store: the signed-in product account and the
 * host's chain capabilities — the single source of host-session state.
 *
 * The store is *fed* by `useSessionSync()` (mounted once) — that hook
 * owns the host-wallet subscription and the permissions probe and writes
 * results here. Everything else (the gate, route loaders, mutations)
 * *reads* the store, including non-React code via `getState()` — which
 * is why this is a store and not a context.
 *
 * Account actions (`requestAccess`, `refresh`) call the host-wallet
 * module functions directly (`requestAccessHostWallet` / `retryHostWallet`
 * are process-level, not hooks). `retryHostPermissions` re-runs the probe
 * against the current `readyAccount`; the genesis hash comes from the
 * `envConfig` singleton, so the action is self-contained.
 */

import { create } from "zustand";
import { requestAccessHostWallet, resolveNetwork, retryHostWallet } from "@shared/chain/host";

import { envConfig } from "@shared/config";
import type { ProductAccountState, ReadyAdminAccount } from "@features/session/account.ts";
import {
  type ChainSupport,
  type RemotePermissionOutcome,
} from "@features/session/permissions.ts";
import {
  resolveHostPermissions,
  type HostPermissionsSnapshot,
} from "@features/session/contracts/probe-permissions.ts";

export interface SessionState {
  readonly accountState: ProductAccountState;
  /** Derived: the resolved account when `accountState.kind === "ready"`. */
  readonly readyAccount: ReadyAdminAccount | null;
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: RemotePermissionOutcome | null;
  readonly permissionsRetryInFlight: boolean;

  /** Feeder: mirror the host-wallet projection. Derives `readyAccount`. */
  setAccountState(accountState: ProductAccountState): void;
  /** Feeder: write a permissions probe result. */
  setPermissions(snapshot: HostPermissionsSnapshot): void;

  /** Open the host "Approve" modal for admin access. */
  requestAccess(): Promise<void>;
  /** Re-run the host-wallet boot sequence. */
  refresh(): Promise<void>;
  /** Re-probe host chain support + `ChainSubmit` for the current account. */
  retryHostPermissions(): Promise<void>;
}

function mainGenesisHash(): `0x${string}` {
  return resolveNetwork(envConfig.chain.network).mainChain.genesisHash as `0x${string}`;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  accountState: { kind: "pending" },
  readyAccount: null,
  hostChainSupport: null,
  chainSubmitGrant: null,
  permissionsRetryInFlight: false,

  setAccountState: (accountState) =>
    set({
      accountState,
      readyAccount: accountState.kind === "ready" ? accountState.account : null,
    }),

  setPermissions: (snapshot) =>
    set({
      hostChainSupport: snapshot.hostChainSupport,
      chainSubmitGrant: snapshot.chainSubmitGrant,
    }),

  requestAccess: async () => {
    await requestAccessHostWallet("Request W3sPay admin access");
  },

  refresh: async () => {
    await retryHostWallet();
  },

  retryHostPermissions: async () => {
    const { readyAccount } = get();
    if (readyAccount == null) {
      set({ hostChainSupport: null, chainSubmitGrant: null, permissionsRetryInFlight: false });
      return;
    }
    set({ permissionsRetryInFlight: true });
    try {
      const snapshot = await resolveHostPermissions(mainGenesisHash(), readyAccount);
      set({
        hostChainSupport: snapshot.hostChainSupport,
        chainSubmitGrant: snapshot.chainSubmitGrant,
      });
    } finally {
      set({ permissionsRetryInFlight: false });
    }
  },
}));
