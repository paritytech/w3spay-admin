/**
 * Type vocabulary for the access-gate variants. The gate produces one
 * of 12 variants (resolved by `resolveAccessVariant` in `src/app/`);
 * each variant carries just enough context to render the right CTA +
 * identity card combination.
 *
 * Clipboard / copy state is no longer threaded through props — every
 * component that needs it consumes `useFeedback()`.
 */

import type { AdminGrantIdentity } from "@features/session/account.ts";
import type { ReactNode } from "react";

export type AccessVariant =
  | { kind: "outside-host" }
  | { kind: "disconnected" }
  | { kind: "pending" }
  | { kind: "requesting" }
  | { kind: "resolving" }
  | { kind: "checking-admin"; identity: AdminGrantIdentity }
  | { kind: "registry-config-error"; reason: string; identity?: AdminGrantIdentity }
  | { kind: "registry-error"; reason: string; identity?: AdminGrantIdentity }
  | { kind: "not-admin"; identity: AdminGrantIdentity }
  | { kind: "host-transport-unavailable"; reason: string; identity?: AdminGrantIdentity }
  | { kind: "chain-submit-denied"; reason?: string; identity: AdminGrantIdentity }
  | { kind: "error"; reason: string };

export interface AdminAccessProps {
  variant: AccessVariant;
  onRequestAccess: () => void;
  onCheckAgain: () => void;
  onRetryHostPermissions: () => void;
  checkInFlight: boolean;
  permissionsRetryInFlight: boolean;
}

export interface AdminAccountCardProps {
  identity: AdminGrantIdentity;
  title?: ReactNode;
  compact?: boolean;
}

export interface AddressBlockProps {
  label: string;
  value: string;
  shortValue: string;
  copyLabel: string;
  copyText: string;
  primary?: boolean;
}
