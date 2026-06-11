// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { AHead } from "@shared/components/primitives.tsx";
import { AccessBody } from "@features/session/components/admin-access/AccessBody.tsx";
import type { AdminAccessProps } from "@features/session/components/admin-access/types.ts";

export { AdminAccountCard } from "@features/session/components/admin-access/AdminAccountCard.tsx";
export { AdminManagementCard } from "@features/session/components/admin-access/AdminManagementCard.tsx";
export type {
  AccessVariant,
  AdminAccessProps,
  AdminAccountCardProps,
} from "@features/session/components/admin-access/types.ts";

export function AdminAccess(props: AdminAccessProps) {
  return (
    <>
      <AHead eyebrow="Access" title="Admin sign-in" size={30} />
      <AccessBody {...props} />
    </>
  );
}
