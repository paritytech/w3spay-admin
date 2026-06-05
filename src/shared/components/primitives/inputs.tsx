/**
 * Form input family: AField (labeled wrapper with hint/error), AInput
 * (single-line), ATextarea (multi-line). All share the surface + border
 * styling so they stack visually in long forms.
 */

import type { ReactNode } from "react";

import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface AFieldProps {
  label?: string;
  eyebrow?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function AField({ label, eyebrow, hint, error, children }: AFieldProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: error ? COLOR.redSoft : COLOR.muted,
          fontWeight: 500,
        }}
      >
        {eyebrow ?? label}
      </span>
      {children}
      {hint && !error ? (
        <span
          style={{
            fontSize: 11,
            color: COLOR.muted,
            fontStyle: "italic",
            fontFamily: FONT.serif,
          }}
        >
          {hint}
        </span>
      ) : null}
      {error ? <span style={{ fontSize: 11, color: COLOR.redSoft }}>{error}</span> : null}
    </label>
  );
}

export interface AInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  autoFocus?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
}

export function AInput({ value, onChange, placeholder, mono, type = "text", autoFocus, inputMode }: AInputProps) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: COLOR.surface,
        color: COLOR.text,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 14,
        fontFamily: mono ? FONT.mono : "inherit",
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
      onFocus={(e) => {
        e.target.style.borderColor = COLOR.border2;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = COLOR.border;
      }}
    />
  );
}

export interface ATextareaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  rows?: number;
}

export function ATextarea({ value, onChange, placeholder, mono, rows = 3 }: ATextareaProps) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        background: COLOR.surface,
        color: COLOR.text,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 13,
        fontFamily: mono ? FONT.mono : "inherit",
        outline: "none",
        width: "100%",
        resize: "none",
        boxSizing: "border-box",
      }}
    />
  );
}
