/**
 * Filter chip used in the status-filter row of the merchants directory.
 */

import type { ReactNode } from "react";

import { COLOR } from "@shared/components/tokens.ts";

export interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? COLOR.text : "transparent",
        color: active ? "#1c1917" : COLOR.text2,
        border: `1px solid ${active ? COLOR.text : COLOR.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
