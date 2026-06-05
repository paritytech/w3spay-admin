/**
 * Editorial button family: APrimary (filled pill), ASecondary (outline
 * pill), AGhost (icon-only or compact text). Sized for mobile touch.
 */

import type { ReactNode } from "react";

import { COLOR } from "@shared/components/tokens.ts";

export interface APrimaryProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  danger?: boolean;
}

export function APrimary({ children, onClick, disabled, full = true, danger }: APrimaryProps) {
  const bg = disabled ? COLOR.surface2 : danger ? "#3a1818" : COLOR.text;
  const fg = disabled ? COLOR.faint : danger ? COLOR.redSoft : "#1c1917";
  const border = danger ? "1px solid rgba(239,68,68,0.4)" : "none";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: bg,
        color: fg,
        border,
        borderRadius: 999,
        padding: "14px 22px",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 500,
        width: full ? "100%" : undefined,
        minHeight: 50,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </button>
  );
}

export interface ASecondaryProps {
  children: ReactNode;
  onClick?: () => void;
  full?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
}

export function ASecondary({ children, onClick, full = true, icon, disabled }: ASecondaryProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color: COLOR.text2,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 999,
        padding: "12px 18px",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: 500,
        width: full ? "100%" : undefined,
        minHeight: 46,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

export interface AGhostProps {
  children: ReactNode;
  onClick?: () => void;
  color?: string;
  /** Native tooltip shown on hover — used to surface full values for truncated labels. */
  title?: string;
}

export function AGhost({ children, onClick, color, title }: AGhostProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: "transparent",
        color: color ?? COLOR.text3,
        border: "none",
        padding: "6px 10px",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 500,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </button>
  );
}
