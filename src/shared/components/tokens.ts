/**
 * W3sPay admin design tokens.
 *
 * Lifted verbatim from `admin-data.jsx` in the Claude Design handoff so the
 * admin console feels like the same product as the cashier-facing w3spay
 * surface. Stone-warm monochrome palette + semantic state colours.
 */

export const COLOR = {
  bg: "#0f0f0f",
  surface: "#1c1917",
  surface2: "#292524",
  border: "#44403c",
  border2: "#57534e",
  text: "#fafaf9",
  text2: "#d6d3d1",
  text3: "#a8a29e",
  muted: "#78716c",
  faint: "#57534e",
  amber: "#f59e0b",
  green: "#22c55e",
  red: "#ef4444",
  blue: "#60a5fa",
  // status pill foreground tints
  greenSoft: "#86efac",
  amberSoft: "#fcd34d",
  redSoft: "#fca5a5",
} as const;

export const FONT = {
  sans: "'DM Sans', system-ui, -apple-system, sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
} as const;

export type MerchantStatus = "active" | "paused" | "revoked";

export const STATUS_COLORS: Record<MerchantStatus, { fg: string; bg: string; dot: string }> = {
  active: { fg: COLOR.greenSoft, bg: "rgba(34,197,94,0.10)", dot: COLOR.green },
  paused: { fg: COLOR.amberSoft, bg: "rgba(245,158,11,0.10)", dot: COLOR.amber },
  revoked: { fg: COLOR.redSoft, bg: "rgba(239,68,68,0.10)", dot: COLOR.red },
};
