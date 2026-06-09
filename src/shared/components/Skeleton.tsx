// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { CSSProperties } from "react";

import { COLOR } from "@shared/components/tokens.ts";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Corner radius (px). Defaults to `4` (rounded pill for typical text rows). */
  radius?: number;
  style?: CSSProperties;
}

/**
 * Visual placeholder used while a query is still hydrating. Renders a muted
 * rounded bar that pulses gently so the layout reserves its final footprint
 * before data lands. Purely decorative — `aria-hidden` so screen readers
 * see the surrounding "Loading…" semantics instead of a barrage of nothing.
 */
export function Skeleton({ width = "100%", height = 12, radius = 4, style }: SkeletonProps) {
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: radius,
        background: COLOR.surface2,
        animation: "w3-skeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
