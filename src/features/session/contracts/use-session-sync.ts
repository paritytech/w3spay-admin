/**
 * Feeds `use-session-store` from the host environment. Mount EXACTLY
 * once (mounted by the root layout) — it owns
 * the single host-wallet subscription (via `useProductAccount`) and the
 * permissions probe, so mounting it twice would double-subscribe.
 *
 * Demo mode (`isDemoMode()`, module-cached) overrides the projection
 * with a synthetic ready account and pretends the host granted chain
 * support + `ChainSubmit` — the single demo code path that replaces the
 * former `Demo*`/`Real*` provider split. `useProductAccount` is still
 * called unconditionally (it returns `outside-host` and never touches
 * the network outside a host), keeping React hook order stable.
 *
 * Also records the app-boot journey milestones (`host-detected`,
 * `account-resolved`, `admin-check-resolved`) — the journey is opened in
 * `main`/`App` and the tracker is idempotent, so a StrictMode
 * double-mount fires each milestone once.
 */

import { useEffect } from "react";

import { journeyTracker } from "@shared/lib/telemetry.ts";
import { useProductAccount } from "./use-product-account.ts";
import { buildDemoReadyAdminAccount } from "@shared/lib/demo/demo-account.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { useIsAdmin } from "./is-admin-query.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

export function useSessionSync(): void {
  const account = useProductAccount();
  const setAccountState = useSessionStore((s) => s.setAccountState);
  const setPermissions = useSessionStore((s) => s.setPermissions);
  const retryHostPermissions = useSessionStore((s) => s.retryHostPermissions);
  const accountState = useSessionStore((s) => s.accountState);
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const hostChainSupport = useSessionStore((s) => s.hostChainSupport);
  const demo = isDemoMode();

  // Mirror the host-wallet projection into the store; demo overrides it.
  useEffect(() => {
    if (demo) {
      setAccountState({ kind: "ready", account: buildDemoReadyAdminAccount() });
    } else {
      setAccountState(account.state);
    }
  }, [demo, account.state, setAccountState]);

  // Probe host permissions when the account resolves. Demo → granted.
  useEffect(() => {
    if (demo) {
      setPermissions({
        hostChainSupport: { kind: "supported" },
        chainSubmitGrant: { granted: true },
      });
      return;
    }
    void retryHostPermissions();
  }, [demo, readyAccount, setPermissions, retryHostPermissions]);

  // app-boot milestones. `useIsAdmin` is deduped by the query cache with
  // the gate's own subscription, so this adds no extra chain read.
  const isAdmin = useIsAdmin(readyAccount?.adminH160 ?? null);
  useEffect(() => {
    if (!journeyTracker.isActive("app-boot")) return;
    if (hostChainSupport != null) {
      journeyTracker.milestone("app-boot", "host-detected", {
        "boot.host_chain_support": hostChainSupport.kind,
      });
    }
    if (
      accountState.kind !== "pending" &&
      accountState.kind !== "resolving" &&
      accountState.kind !== "requesting"
    ) {
      journeyTracker.milestone("app-boot", "account-resolved", {
        "boot.identity_state": accountState.kind,
      });
    }
    const isAdminKind = isAdmin.state.kind;
    if (isAdminKind !== "idle" && isAdminKind !== "checking") {
      journeyTracker.milestone("app-boot", "admin-check-resolved", {
        "boot.is_admin": isAdmin.granted,
      });
    }
  }, [hostChainSupport, accountState.kind, isAdmin.state.kind, isAdmin.granted]);
}
