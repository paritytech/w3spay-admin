/**
 * One item row inside the config detail screen — name, SKU, CASH price,
 * plus inline edit / delete buttons. Pure presentational: every action
 * bubbles up to `ItemsDetail` and ultimately the tab orchestrator.
 */

import { useState } from "react";

import { Icon } from "@shared/components/Icon.tsx";
import { AMono } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { fmtCASH, type Item } from "@features/items/items-model.ts";
import { ICON_BTN_STYLE } from "./items-styles.ts";

export interface ItemRowProps {
  item: Item;
  onEdit: () => void;
  onDelete: () => void;
}

export function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto auto",
        gap: 10,
        alignItems: "center",
        padding: "12px",
        background: COLOR.surface,
        border: `1px solid ${COLOR.surface2}`,
        borderRadius: 10,
        minHeight: 56,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            color: COLOR.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </div>
        <AMono size={10} color={COLOR.faint} weight={400}>
          {item.id}
        </AMono>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <AMono size={15} color={COLOR.text} weight={500}>
          {fmtCASH(item.price)}
        </AMono>
        <span style={{ fontSize: 9.5, color: COLOR.muted, letterSpacing: "0.1em" }}>CASH</span>
      </div>
      {confirming ? (
        <>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            title="Cancel"
            style={ICON_BTN_STYLE}
            aria-label={`Cancel deleting ${item.name}`}
          >
            <Icon name="x" size={14} color={COLOR.text3} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Confirm delete"
            style={{
              ...ICON_BTN_STYLE,
              background: "#3a1818",
              border: "1px solid rgba(239,68,68,0.4)",
            }}
            aria-label={`Confirm delete ${item.name}`}
          >
            <Icon name="check" size={15} color={COLOR.redSoft} />
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onEdit} title="Edit" style={ICON_BTN_STYLE} aria-label={`Edit ${item.name}`}>
            <Icon name="pencil-line" size={15} color={COLOR.text3} />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Delete"
            style={ICON_BTN_STYLE}
            aria-label={`Delete ${item.name}`}
          >
            <Icon name="x" size={14} color={COLOR.redSoft} />
          </button>
        </>
      )}
    </div>
  );
}
