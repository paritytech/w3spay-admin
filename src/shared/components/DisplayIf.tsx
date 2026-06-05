/**
 * Declarative conditional render.
 *
 * Prefer `<DisplayIf condition={x}>…</DisplayIf>` over inline `{x && …}`
 * in JSX: it never renders a stray `0`/`""` when the condition is a
 * falsy non-boolean, reads as intent, and gives an explicit `fallback`
 * slot. Reference implementation — adopt in new/edited components; no
 * blanket sweep of existing `&&` sites.
 */

import type { ReactNode } from "react";

export interface DisplayIfProps {
  readonly condition: boolean;
  readonly children: ReactNode;
  /** Rendered when `condition` is false. Defaults to nothing. */
  readonly fallback?: ReactNode;
}

export function DisplayIf({ condition, children, fallback = null }: DisplayIfProps) {
  return <>{condition ? children : fallback}</>;
}
