// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { COLOR } from "@shared/components/tokens.ts";
import { Icon, type IconName } from "@shared/components/Icon.tsx";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** When set, renders an icon instead of the label (the label still
   *  drives `title` / `aria-label` for accessibility). */
  icon?: IconName;
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
      {items.map(({ id, label, icon }) => {
        const active = value === id;
        const color = active ? COLOR.text : COLOR.muted;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            style={{
              background: "transparent",
              border: "none",
              color,
              padding: icon ? "12px 10px 11px" : "12px 6px 11px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              borderBottom: `2px solid ${active ? COLOR.text : "transparent"}`,
              marginBottom: -1,
              transition: "color .15s, border-color .15s",
              flex: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon ? <Icon name={icon} size={18} color={color} /> : label}
          </button>
        );
      })}
    </div>
  );
}
