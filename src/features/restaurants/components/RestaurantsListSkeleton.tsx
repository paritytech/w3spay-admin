// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { ACard, AHead } from "@shared/components/primitives.tsx";
import { Skeleton } from "@shared/components/Skeleton.tsx";

const PLACEHOLDER_ROW_COUNT = 4;
// Per-row width ratios (in %) — varied so the list doesn't look stamped.
const NAME_WIDTHS = ["62%", "48%", "70%", "55%"] as const;
const ADDR_WIDTHS = ["78%", "64%", "82%", "58%"] as const;

/**
 * Skeleton fallback for the restaurants directory while the registry query is
 * still hydrating. Renders the same heading + card-stack chrome as
 * `RestaurantsList` so the layout stays stable when real rows replace it.
 */
export function RestaurantsListSkeleton() {
  return (
    <>
      <AHead eyebrow="Directory" title="Restaurants" size={32} />
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading restaurants"
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {Array.from({ length: PLACEHOLDER_ROW_COUNT }, (_, i) => (
          <SkeletonRow key={i} nameWidth={NAME_WIDTHS[i]!} addrWidth={ADDR_WIDTHS[i]!} />
        ))}
      </div>
    </>
  );
}

function SkeletonRow({ nameWidth, addrWidth }: { nameWidth: string; addrWidth: string }) {
  return (
    <ACard padding={14}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Skeleton width={nameWidth} height={18} radius={4} />
            <Skeleton width={56} height={10} radius={3} />
          </div>
          <Skeleton width={addrWidth} height={10} radius={3} />
        </div>
        <Skeleton width={14} height={14} radius={3} style={{ flexShrink: 0, marginTop: 2 }} />
      </div>
    </ACard>
  );
}
