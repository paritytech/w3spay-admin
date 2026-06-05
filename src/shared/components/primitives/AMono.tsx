/**
 * Tabular-numeric mono span. Use everywhere numbers should align across
 * rows (balances, terminal IDs, sequence numbers).
 */

import type { ReactNode } from "react";

import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface AMonoProps {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  /** Native tooltip shown on hover — used to surface full values for truncated labels. */
  title?: string;
}

export function AMono({ children, size = 13, color, weight = 500, title }: AMonoProps) {
  return (
    <span
      title={title}
      style={{
        fontFamily: FONT.mono,
        fontVariantNumeric: "tabular-nums",
        fontSize: size,
        color: color ?? COLOR.text,
        fontWeight: weight,
        letterSpacing: "-0.005em",
      }}
    >
      {children}
    </span>
  );
}
