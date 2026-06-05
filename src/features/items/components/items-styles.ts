/**
 * Tiny shared style constants for the Items tab screens.
 *
 * Held out of any single component so peer files don't duplicate the
 * icon-button shape and end up drifting on tap-target size — the design
 * is locked at 40×40 for accessibility on mobile.
 */

import type { CSSProperties } from "react";

import { COLOR, FONT } from "@shared/components/tokens.ts";

export const ICON_BTN_STYLE: CSSProperties = {
  background: "transparent",
  border: `1px solid ${COLOR.border}`,
  borderRadius: 10,
  width: 40,
  height: 40,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  flex: "0 0 auto",
  WebkitTapHighlightColor: "transparent",
};

export const DANGER_BTN_STYLE: CSSProperties = {
  background: "transparent",
  color: COLOR.redSoft,
  border: "1px solid rgba(239,68,68,0.35)",
  borderRadius: 999,
  padding: "12px 18px",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 500,
  width: "100%",
  minHeight: 46,
  cursor: "pointer",
};

export const CATEGORY_SELECT_STYLE: CSSProperties = {
  background: COLOR.surface,
  color: COLOR.text,
  border: `1px solid ${COLOR.border}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  appearance: "none",
  WebkitAppearance: "none",
  cursor: "pointer",
  width: "100%",
  boxSizing: "border-box",
  paddingRight: 32,
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
};

export const PRICE_INPUT_STYLE: CSSProperties = {
  background: "transparent",
  color: COLOR.text,
  border: "none",
  outline: "none",
  fontFamily: FONT.mono,
  fontSize: 22,
  fontWeight: 500,
  letterSpacing: "-0.02em",
  flex: 1,
  padding: 0,
  fontVariantNumeric: "tabular-nums",
  width: "100%",
  minWidth: 0,
};
