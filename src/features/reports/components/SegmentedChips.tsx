/**
 * Shared pill-segment chip group used by the Reports → Transactions
 * controls (view toggle, period picker, status filter). Three controls
 * with the same visual language — one implementation, three thin
 * wrappers that own copy and the union type.
 *
 * Generic over the value union so each wrapper stays type-safe at the
 * callsite without runtime widening.
 */

import { COLOR } from "@shared/components/tokens.ts";

export interface SegmentedChipsItem<T extends string> {
  readonly id: T;
  readonly label: string;
}

export interface SegmentedChipsProps<T extends string> {
  readonly value: T;
  readonly items: ReadonlyArray<SegmentedChipsItem<T>>;
  readonly onChange: (next: T) => void;
  /** Optional uppercase eyebrow shown above the chip row. */
  readonly eyebrow?: string;
}

export function SegmentedChips<T extends string>({
  value,
  items,
  onChange,
  eyebrow,
}: SegmentedChipsProps<T>) {
  return (
    <div>
      {eyebrow ? (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: COLOR.muted,
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!active) onChange(item.id);
              }}
              style={{
                background: active ? COLOR.text : "transparent",
                color: active ? "#1c1917" : COLOR.text2,
                border: `1px solid ${active ? COLOR.text : COLOR.border}`,
                borderRadius: 999,
                padding: "8px 14px",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                cursor: active ? "default" : "pointer",
                minHeight: 32,
                transition: "background .15s, border-color .15s, color .15s",
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
