// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { CSSProperties, ReactNode } from "react";

import { COLOR } from "@shared/components/tokens.ts";

export interface ACardProps {
  children: ReactNode;
  onClick?: () => void;
  padding?: number;
  style?: CSSProperties;
}

export function ACard({ children, onClick, padding = 14, style }: ACardProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        background: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 14,
        padding,
        cursor: interactive ? "pointer" : "default",
        transition: "background .15s, border-color .15s",
        ...style,
      }}
      onMouseEnter={
        interactive
          ? (e) => {
              const el = e.currentTarget;
              el.style.borderColor = COLOR.border2;
              el.style.background = "rgba(41,37,36,0.7)";
            }
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              const el = e.currentTarget;
              el.style.borderColor = style?.borderColor ?? COLOR.border;
              el.style.background = COLOR.surface;
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
