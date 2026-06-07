/**
 * Root layout — the app chrome (wordmark rail, tab bar, scroll frame,
 * demo banner, feedback toast, screen-transition animation).
 *
 * `RootLayout` mounts the single host-wallet subscription via
 * `useSessionSync` (EXACTLY once, at the root) and renders `Shell`. It
 * reads session + registry state through feature hooks (`useSession`,
 * `useMerchants`) — there is no product context provider. The access
 * gate lives in `./guards.tsx`.
 *
 * Tab + tab-bar visibility come from each route's `staticData`; the
 * animation key is the pathname so a route (or `$param`) change
 * retriggers the screen-in transition.
 */

import { useEffect } from "react";
import { Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

import { envConfig } from "@shared/config";
import { journeyTracker } from "@shared/lib/telemetry.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { useSession } from "@features/session/contracts/use-session.ts";
import { useSessionSync } from "@features/session/contracts/use-session-sync.ts";
import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useGateVerdict } from "./guards.tsx";
import { DemoModeBanner } from "@shared/components/DemoModeBanner.tsx";
import { FeedbackToast } from "@shared/components/FeedbackToast.tsx";
import { AFrame, ARail, ATabs } from "@shared/components/primitives.tsx";
import { DebugPanel } from "@/shared/chain/host/debug/index.ts";
import { TABS, TAB_DEFAULT_PATH, type TabId } from "./routes.ts";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    tab?: TabId;
    /** Whether the top tab bar shows on this route (default true). */
    showTabs?: boolean;
  }
}

export function RootLayout() {
  // Single host-wallet subscription + permissions probe + boot telemetry.
  useSessionSync();
  return <Shell />;
}

function Shell() {
  const navigate = useNavigate();
  const router = useRouter();
  const { adminAccount, readyAccount } = useSession();
  const { registry } = useMerchants();
  const { isAdmin } = useGateVerdict();

  const matches = useRouterState({ select: (s) => s.matches });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const leaf = matches[matches.length - 1];
  const tab = (leaf?.staticData.tab ?? "merchants") as TabId;
  const routeShowTabs = leaf?.staticData.showTabs ?? true;

  // Re-run route loaders once the host session resolves an account, so
  // any account-gated prefetch reflects the signed-in admin.
  useEffect(() => {
    void router.invalidate();
  }, [router, readyAccount]);

  // Telemetry: surface the merchant-registry milestone for the app-boot
  // journey. Fires once when the registry transitions out of `loading`
  // (relocated here from the former merchant-contract provider so it
  // still fires exactly once — Shell is mounted once at the root).
  useEffect(() => {
    if (!journeyTracker.isActive("app-boot")) return;
    if (registry.kind === "loading") return;
    journeyTracker.milestone("app-boot", "registry-loaded", {
      "boot.registry_kind": registry.kind,
    });
  }, [registry.kind]);

  // Telemetry: close the app-boot journey once account + admin-check +
  // registry have all settled (started in `App`). Idempotent.
  useEffect(() => {
    if (!journeyTracker.isActive("app-boot")) return;
    const accountResolving =
      adminAccount.state.kind === "pending" ||
      adminAccount.state.kind === "resolving" ||
      adminAccount.state.kind === "requesting";
    if (accountResolving) return;
    if (adminAccount.isAdmin.inFlight) return;
    if (registry.kind === "loading") return;
    journeyTracker.complete("app-boot", {
      "boot.is_admin": isAdmin,
      "boot.registry_kind": registry.kind,
    });
  }, [adminAccount.state.kind, adminAccount.isAdmin.inFlight, registry.kind, isAdmin]);

  const showTabs = isAdmin && registry.kind === "ready" && routeShowTabs;

  const header = (
    <>
      <ARail title="W3sPay" subtitle="admin" />
      {showTabs ? (
        <ATabs<TabId>
          value={tab}
          onChange={(id) => {
            if (id !== tab) void navigate({ to: TAB_DEFAULT_PATH[id] });
          }}
          items={TABS}
        />
      ) : null}
    </>
  );

  return (
    <div className="workspace">
      {isDemoMode() ? <DemoModeBanner /> : null}
      <AFrame header={header}>
        <div
          key={pathname}
          style={{ animation: "w3-screen-in 240ms cubic-bezier(.2,.7,.2,1)" }}
        >
          <Outlet />
        </div>
      </AFrame>
      <FeedbackToast />
      {envConfig.debug.enabled ? (
        <DebugPanel defaultOpen={envConfig.debug.openByDefault} initialFilter="" />
      ) : null}
    </div>
  );
}
