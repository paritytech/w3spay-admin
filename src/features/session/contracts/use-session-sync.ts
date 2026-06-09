// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

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

  useEffect(() => {
    if (demo) {
      setAccountState({ kind: "ready", account: buildDemoReadyAdminAccount() });
    } else {
      setAccountState(account.state);
    }
  }, [demo, account.state, setAccountState]);

  // Boot-time permission probes. Fire ONCE at mount — not gated on
  // `readyAccount`. The probes are account-agnostic (chain-support is a
  // feature query; ChainSubmit is a session-scoped grant), and
  // `runExclusiveHostModal` serializes the prompt behind any prior boot
  // modal (Sentry remote-origin). Wallet init runs in parallel so by the
  // time the user finishes granting, the wallet has its product account.
  useEffect(() => {
    if (demo) {
      setPermissions({
        hostChainSupport: { kind: "supported" },
        chainSubmitGrant: { granted: true },
      });
      return;
    }
    void retryHostPermissions();
  }, [demo, setPermissions, retryHostPermissions]);

  // app-boot milestones. `useIsAdmin` is deduped by the query cache with
  // the gate's own subscription, so this adds no extra chain read.
  const isAdmin = useIsAdmin(readyAccount?.adminH160 ?? null);
  useEffect(() => {
    if (!journeyTracker.isActive("w3spay-admin:app-boot")) return;
    if (hostChainSupport != null) {
      journeyTracker.milestone("w3spay-admin:app-boot", "host-detected", {
        "boot.host_chain_support": hostChainSupport.kind,
      });
    }
    if (
      accountState.kind !== "pending" &&
      accountState.kind !== "resolving" &&
      accountState.kind !== "requesting"
    ) {
      journeyTracker.milestone("w3spay-admin:app-boot", "account-resolved", {
        "boot.identity_state": accountState.kind,
      });
    }
    const isAdminKind = isAdmin.state.kind;
    if (isAdminKind !== "idle" && isAdminKind !== "checking") {
      journeyTracker.milestone("w3spay-admin:app-boot", "admin-check-resolved", {
        "boot.is_admin": isAdmin.granted,
      });
    }
  }, [hostChainSupport, accountState.kind, isAdmin.state.kind, isAdmin.granted]);
}
