/**
 * Underline tab bar generic over the tab id union. The active tab is
 * tracked via `value`; switching is up to the parent.
 */

import { COLOR } from "@shared/components/tokens.ts";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export interface ATabsProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  items: ReadonlyArray<TabItem<T>>;
}

export function ATabs<T extends string>({ value, onChange, items }: ATabsProps<T>) {
  return (
    <div
      style={{
        display: "flex",
        padding: "0 20px",
        borderBottom: `1px solid ${COLOR.surface2}`,
        flexShrink: 0,
        gap: 4,
      }}
    >
      {items.map(({ id, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              background: "transparent",
              border: "none",
              color: active ? COLOR.text : COLOR.muted,
              padding: "12px 6px 11px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              borderBottom: `2px solid ${active ? COLOR.text : "transparent"}`,
              marginBottom: -1,
              transition: "color .15s, border-color .15s",
              flex: "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
