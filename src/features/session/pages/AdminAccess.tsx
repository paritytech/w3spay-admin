/**
 * First-paint gate before the admin console renders.
 *
 * Three states:
 *   - disconnected (or outside host): show a sign-in / request access CTA.
 *   - connected but not (yet) an admin: show the copyable H160 grant
 *     address and a secondary SS58 display so the maintainer can grant
 *     access via `addAdmin(adminH160)` outside the app.
 *   - admin: the parent renders the real console instead of this screen.
 *
 * The 11 variant cards live in `./admin-access/AccessBody.tsx`; this
 * file keeps the public `AdminAccess` + `AdminAccountCard` exports
 * stable for `App.tsx` and `tests/admin-access.test.ts`.
 */

import { AHead } from "@shared/components/primitives.tsx";
import { AccessBody } from "@features/session/components/admin-access/AccessBody.tsx";
import type { AdminAccessProps } from "@features/session/components/admin-access/types.ts";

export { AdminAccountCard } from "@features/session/components/admin-access/AdminAccountCard.tsx";
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
