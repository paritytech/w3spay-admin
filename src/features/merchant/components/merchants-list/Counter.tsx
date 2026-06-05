/**
 * Tiny counter pill (label + value with optional status dot) shown in
 * the merchants directory header.
 */

import { AMono } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export interface CounterProps {
  label: string;
  value: number;
  dot?: string;
}

export function Counter({ label, value, dot }: CounterProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        background: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 999,
      }}
    >
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 999, background: dot }} /> : null}
      <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: COLOR.muted }}>
        {label}
      </span>
      <AMono size={12}>{value}</AMono>
    </div>
  );
}
