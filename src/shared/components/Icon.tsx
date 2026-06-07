/**
 * Pure-SVG lucide-style icons used by the admin console.
 *
 * Ported from `screens-shared.jsx::I`, trimmed to the names actually
 * referenced by the admin screens to avoid carrying dead pixels.
 */

import type { ReactElement } from "react";

type IconName =
  | "check"
  | "x"
  | "chevron-left"
  | "chevron-right"
  | "scan"
  | "qr-code"
  | "wallet"
  | "alert-triangle"
  | "refresh-cw"
  | "copy"
  | "plus"
  | "shield-check"
  | "pencil-line"
  | "info"
  | "trash-2";

const path = (d: string, k?: string | number): ReactElement => (
  <path key={k} d={d} />
);
const line = (x1: number, y1: number, x2: number, y2: number, k?: string | number): ReactElement => (
  <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
);
const rect = (x: number, y: number, w: number, h: number, rx: number, k?: string | number): ReactElement => (
  <rect key={k} x={x} y={y} width={w} height={h} rx={rx} />
);
const circle = (cx: number, cy: number, r: number, k?: string | number): ReactElement => (
  <circle key={k} cx={cx} cy={cy} r={r} />
);

const PATHS: Record<IconName, ReactElement[]> = {
  check: [path("M20 6 9 17l-5-5", 1)],
  x: [line(18, 6, 6, 18, 1), line(6, 6, 18, 18, 2)],
  "chevron-left": [path("m15 18-6-6 6-6", 1)],
  "chevron-right": [path("m9 18 6-6-6-6", 1)],
  scan: [
    path("M3 7V5a2 2 0 0 1 2-2h2", 1),
    path("M17 3h2a2 2 0 0 1 2 2v2", 2),
    path("M21 17v2a2 2 0 0 1-2 2h-2", 3),
    path("M7 21H5a2 2 0 0 1-2-2v-2", 4),
    line(3, 12, 21, 12, 5),
  ],
  "qr-code": [
    rect(3, 3, 7, 7, 1, 1),
    rect(14, 3, 7, 7, 1, 2),
    rect(3, 14, 7, 7, 1, 3),
    line(14, 14, 14, 17, 4),
    line(14, 17, 17, 17, 5),
    line(17, 14, 17, 21, 6),
    line(21, 14, 21, 17, 7),
    line(21, 21, 18, 21, 8),
  ],
  wallet: [
    path("M20 12V8a2 2 0 0 0-2-2H5a1 1 0 0 1 0-2h14", 1),
    path("M3 6v12a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-4", 2),
    circle(17, 14, 1, 3),
  ],
  "alert-triangle": [
    path("M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z", 1),
    line(12, 9, 12, 13, 2),
    line(12, 17, 12.01, 17, 3),
  ],
  "refresh-cw": [
    path("M3 12a9 9 0 0 1 15-6.7L21 8", 1),
    path("m21 3 0 5-5 0", 2),
    path("M21 12a9 9 0 0 1-15 6.7L3 16", 3),
    path("m3 21 0-5 5 0", 4),
  ],
  copy: [rect(9, 9, 13, 13, 2, 1), path("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1", 2)],
  plus: [line(12, 5, 12, 19, 1), line(5, 12, 19, 12, 2)],
  "shield-check": [
    path("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", 1),
    path("m9 12 2 2 4-4", 2),
  ],
  "pencil-line": [
    path("M12 20h9", 1),
    path("M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z", 2),
  ],
  info: [
    circle(12, 12, 10, 1),
    line(12, 16, 12, 12, 2),
    line(12, 8, 12.01, 8, 3),
  ],
  "trash-2": [
    path("M3 6h18", 1),
    path("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", 2),
    line(10, 11, 10, 17, 3),
    line(14, 11, 14, 17, 4),
  ],
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 16, color = "currentColor", strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", flexShrink: 0 }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
