/**
 * Single-line label / value row that copies its value to the clipboard
 * on click and truncates the value with an ellipsis if it overflows.
 *
 * Used across the terminal-details surfaces (`MerchantDetail`,
 * `PayoutBlock`, `ConfigureT3rminal`'s QR detail card, etc.) so every
 * displayed identifier — address, CID, terminalKey, timestamp — is one
 * tap away from the clipboard.
 *
 * Behaviour:
 *   - Right-side value uses `text-overflow: ellipsis` so long strings
 *     (SS58, hex hashes) don't push the layout sideways on narrow
 *     screens. Full value is exposed via the `title` attribute on
 *     hover and via the copy action.
 *   - Click anywhere on the row → `copyValue(value, copyField)`.
 *   - When `copiedField` matches, the icon flips to "check" and the
 *     value tint shifts to green for ~1.5s (the feedback context owns
 *     the timer).
 *   - When `value` is empty the row degrades to a muted "—" rendering
 *     and is non-interactive so we don't pollute the clipboard with
 *     empty strings.
 */

import type { ReactNode } from "react";

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { Icon } from "./Icon.tsx";
import { COLOR, FONT } from "./tokens.ts";

export interface CopyableRowProps {
  readonly label: string;
  /** Stringified value used both for display and clipboard. */
  readonly value: string;
  /**
   * Optional override for what gets rendered when `value` is the
   * canonical form but a friendlier display string exists (e.g. a
   * formatted timestamp paired with a copyable ISO string). Defaults to
   * `value`.
   */
  readonly display?: ReactNode;
  readonly mono?: boolean;
  /** Identifier passed to the feedback context for per-row copy state. */
  readonly copyField?: string;
  /** Hide the dashed separator drawn under the row. */
  readonly noBorder?: boolean;
}

export function CopyableRow({
  label,
  value,
  display,
  mono,
  copyField,
  noBorder,
}: CopyableRowProps) {
  const copiedField = useFeedbackStore((s) => s.copiedField);
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const field = copyField ?? label.toLowerCase();
  const copied = copiedField === field;
  const isEmpty = value.trim().length === 0;
  const renderedValue = display ?? (isEmpty ? "—" : value);

  const onClick = () => {
    if (isEmpty) return;
    copyValue(value, field);
  };

  const valueColor = copied
    ? COLOR.greenSoft
    : isEmpty
      ? COLOR.muted
      : COLOR.text2;

  return (
    <div
      onClick={onClick}
      title={isEmpty ? undefined : value}
      role={isEmpty ? undefined : "button"}
      tabIndex={isEmpty ? undefined : 0}
      onKeyDown={(e) => {
        if (isEmpty) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "8px 0",
        borderBottom: noBorder ? "none" : `1px dashed ${COLOR.surface2}`,
        cursor: isEmpty ? "default" : "pointer",
        // Reset the default focus ring — the inner value tint already
        // signals interactivity, and a bright outline would clash with
        // the editorial palette.
        outline: "none",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: COLOR.muted,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          flex: 1,
          justifyContent: "flex-end",
        }}
      >
        <span
          style={{
            fontFamily: mono ? FONT.mono : "inherit",
            fontSize: mono ? 11.5 : 12,
            color: valueColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            textAlign: "right",
            transition: "color .15s",
          }}
        >
          {renderedValue}
        </span>
        {isEmpty ? null : (
          <span
            aria-hidden
            style={{
              color: copied ? COLOR.green : COLOR.text3,
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
          </span>
        )}
      </span>
    </div>
  );
}
