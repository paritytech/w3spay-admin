// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { ACard } from "@shared/components/primitives.tsx";
import { Skeleton } from "@shared/components/Skeleton.tsx";

const PLACEHOLDER_ROW_COUNT = 3;
const GROUP_WIDTHS = ["52%", "40%", "60%"] as const;
const CID_WIDTHS = ["64%", "70%", "58%"] as const;

/**
 * Skeleton fallback for the processor-config directory while the registry
 * query is still hydrating. Mirrors the live row layout (group id + updated
 * timestamp on top, mono CID + size below) so the list footprint is stable.
 */
export function ConfigListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading payment processor configurations"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {Array.from({ length: PLACEHOLDER_ROW_COUNT }, (_, i) => (
        <SkeletonRow key={i} groupWidth={GROUP_WIDTHS[i]!} cidWidth={CID_WIDTHS[i]!} />
      ))}
    </div>
  );
}

function SkeletonRow({ groupWidth, cidWidth }: { groupWidth: string; cidWidth: string }) {
  return (
    <ACard padding={14}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <Skeleton width={groupWidth} height={16} radius={4} />
        <Skeleton width={84} height={10} radius={3} />
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
        <Skeleton width={cidWidth} height={11} radius={3} />
        <Skeleton width={48} height={10} radius={3} />
      </div>
    </ACard>
  );
}
