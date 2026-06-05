/**
 * Access gate.
 *
 * `useGateVerdict` composes the host session + admin check + registry
 * read into a single verdict, shared by the root chrome (tab visibility)
 * and the pathless `_authed` route. `AuthedLayout` overlays
 * `<AdminAccess>` when the account isn't an admin / the host can't sign,
 * and `<RegistryShell>` while the registry loads — an in-place overlay,
 * NOT a redirect, so granting access lands on the underlying route.
 *
 * Session + registry state come from feature hooks (`useSession`,
 * `useMerchants`); there is no product context provider.
 */

import { Outlet } from "@tanstack/react-router";

import { resolveAccessVariant } from "@features/session/api/resolve-access-variant.ts";
import { useSession } from "@features/session/api/use-session.ts";
import { useMerchants } from "@features/merchant/api/use-merchants.ts";
import { AdminAccess, type AccessVariant } from "@features/session/pages/AdminAccess.tsx";
import { RegistryShell } from "@features/session/pages/RegistryShell.tsx";

export interface GateVerdict {
  readonly isAdmin: boolean;
  readonly accessVariant: AccessVariant;
  readonly registryReady: boolean;
}

/**
 * Compose the host session + admin check + registry state into the gate
 * verdict — shared by the root chrome (tab visibility) and the `_authed`
 * gate.
 */
export function useGateVerdict(): GateVerdict {
  const { adminAccount, readyAccount, hostChainSupport, chainSubmitGrant } = useSession();
  const { registry } = useMerchants();

  const accessVariant = resolveAccessVariant({
    accountState: adminAccount.state,
    registry,
    isAdmin: adminAccount.isAdmin,
    hostChainSupport,
    chainSubmitGrant,
  });
  const isAdmin =
    readyAccount != null &&
    adminAccount.isAdmin.granted &&
    (hostChainSupport == null || hostChainSupport.kind !== "unavailable") &&
    (chainSubmitGrant == null || chainSubmitGrant.granted === true);

  return { isAdmin, accessVariant, registryReady: registry.kind === "ready" };
}

export function AuthedLayout() {
  const { isAdmin, accessVariant } = useGateVerdict();
  const { registry } = useMerchants();

  if (!isAdmin) return <Gate variant={accessVariant} />;
  if (registry.kind !== "ready") return <RegistryShell registry={registry} />;
  return <Outlet />;
}

function Gate({ variant }: { variant: AccessVariant }) {
  const { adminAccount, permissionsRetryInFlight, retryHostPermissions } = useSession();
  const { registry, refreshMerchantEntries } = useMerchants();
  return (
    <AdminAccess
      variant={variant}
      onRequestAccess={() => {
        void adminAccount.requestAccess();
      }}
      onCheckAgain={() => {
        void (async () => {
          await adminAccount.refresh();
          await adminAccount.isAdmin.refresh();
          if (registry.kind === "error" || registry.kind === "config-error") {
            await refreshMerchantEntries();
          }
        })();
      }}
      onRetryHostPermissions={() => {
        void retryHostPermissions();
      }}
      checkInFlight={adminAccount.isAdmin.inFlight}
      permissionsRetryInFlight={permissionsRetryInFlight}
    />
  );
}
