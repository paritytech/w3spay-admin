/**
 * Map the host + registry + isAdmin state machines into a single
 * `AccessVariant` consumed by the `<AdminAccess>` gate.
 *
 * Pure function — no hooks, no side effects. Lives in its own module so
 * it can be reasoned about (and, if needed, tested) without spinning up
 * the full App tree.
 */

import type { UseIsAdminResult } from "./is-admin.ts";
import type { MerchantRegistryReadState } from "@features/merchant/contracts/merchant-queries.ts";
import type { ChainSupport } from "@features/session/permissions.ts";
import type { AdminAccountState } from "@features/session/account.ts";
import type { AccessVariant } from "@features/session/pages/AdminAccess.tsx";

export interface ResolveAccessArgs {
  readonly accountState: AdminAccountState;
  readonly registry: MerchantRegistryReadState;
  readonly isAdmin: UseIsAdminResult;
  readonly hostChainSupport: ChainSupport | null;
  readonly chainSubmitGrant: { granted: boolean; error?: string } | null;
}

export function resolveAccessVariant({
  accountState,
  registry,
  isAdmin,
  hostChainSupport,
  chainSubmitGrant,
}: ResolveAccessArgs): AccessVariant {
  const identity = accountState.kind === "ready" ? accountState.account : undefined;
  if (registry.kind === "config-error") {
    return { kind: "registry-config-error", reason: registry.reason, identity };
  }
  switch (accountState.kind) {
    case "outside-host": return { kind: "outside-host" };
    case "pending":      return { kind: "pending" };
    case "requesting":   return { kind: "requesting" };
    case "resolving":    return { kind: "resolving" };
    case "disconnected": return { kind: "disconnected" };
    case "error":        return { kind: "error", reason: accountState.reason };
    case "ready":
      if (hostChainSupport != null && hostChainSupport.kind === "unavailable") {
        return { kind: "host-transport-unavailable", reason: hostChainSupport.reason, identity: accountState.account };
      }
      if (chainSubmitGrant != null && chainSubmitGrant.granted !== true) {
        return { kind: "chain-submit-denied", reason: chainSubmitGrant.error, identity: accountState.account };
      }
      if (registry.kind === "error") {
        return { kind: "registry-error", reason: registry.reason, identity: accountState.account };
      }
      if (isAdmin.state.kind === "error") {
        return { kind: "registry-error", reason: isAdmin.state.reason, identity: accountState.account };
      }
      if (isAdmin.state.kind === "denied") {
        return { kind: "not-admin", identity: accountState.account };
      }
      // idle / checking — isAdmin check still in flight
      return { kind: "checking-admin", identity: accountState.account };
  }
}
