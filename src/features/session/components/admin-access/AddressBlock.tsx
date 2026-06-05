/**
 * Single copyable address row used inside `AdminAccountCard`. Surfaces
 * the SS58 / H160 representation and a Ghost copy button that flips to
 * a green checkmark on success. Pulls clipboard state from
 * `useFeedback()`.
 */

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { AGhost } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import type { AddressBlockProps } from "./types.ts";

export function AddressBlock({
  label,
  value,
  shortValue,
  copyLabel,
  copyText,
  primary,
}: AddressBlockProps) {
  const copiedField = useFeedbackStore((s) => s.copiedField);
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const copied = copiedField === copyLabel;
  return (
    <>
      <div
        style={{
          marginTop: primary ? 4 : 0,
          fontSize: 11,
          color: COLOR.muted,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {label} · {shortValue}
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: primary ? 12 : 11,
          color: primary ? COLOR.text : COLOR.text3,
          wordBreak: "break-all",
          lineHeight: 1.55,
          marginTop: primary ? 6 : 4,
        }}
      >
        {value}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <AGhost
          onClick={() => copyValue(value, copyLabel)}
          color={copied ? COLOR.green : COLOR.text3}
        >
          <Icon name={copied ? "check" : "copy"} size={12} />{" "}
          {copied ? "Copied" : copyText}
        </AGhost>
      </div>
    </>
  );
}
