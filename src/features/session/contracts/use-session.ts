/**
 * Session composition hook — the single read surface for the signed-in
 * admin account.
 *
 * Session data lives in `use-session-store` (Zustand, fed by
 * `useSessionSync`); the admin check is a TanStack Query (`useIsAdmin`).
 * This hook composes store selectors + the deduped is-admin query into
 * the `SessionView` the gate, root chrome, and account screen read. It
 * holds no state of its own and needs no provider — `useSessionSync` is
 * mounted exactly once by the root layout.
 */

import type { ReadyAdminAccount, UseAdminAccountResult } from "@features/session/account.ts";
import type { ChainSupport, RemotePermissionOutcome } from "@features/session/permissions.ts";
import { useIsAdmin } from "./is-admin-query.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

export interface SessionView {
  readonly adminAccount: UseAdminAccountResult;
  readonly readyAccount: ReadyAdminAccount | null;
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: RemotePermissionOutcome | null;
  readonly permissionsRetryInFlight: boolean;
  retryHostPermissions(): Promise<void>;
}

export function useSession(): SessionView {
  const accountState = useSessionStore((s) => s.accountState);
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const hostChainSupport = useSessionStore((s) => s.hostChainSupport);
  const chainSubmitGrant = useSessionStore((s) => s.chainSubmitGrant);
  const permissionsRetryInFlight = useSessionStore((s) => s.permissionsRetryInFlight);
  const requestAccess = useSessionStore((s) => s.requestAccess);
  const refresh = useSessionStore((s) => s.refresh);
  const retryHostPermissions = useSessionStore((s) => s.retryHostPermissions);

  const isAdmin = useIsAdmin(readyAccount?.adminH160 ?? null);

  const adminAccount: UseAdminAccountResult = {
    state: accountState,
    isAdmin,
    requestAccess,
    refresh,
  };

  return {
    adminAccount,
    readyAccount,
    hostChainSupport,
    chainSubmitGrant,
    permissionsRetryInFlight,
    retryHostPermissions,
  };
}
