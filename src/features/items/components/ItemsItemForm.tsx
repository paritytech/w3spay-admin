// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";

import { Icon } from "@shared/components/Icon.tsx";
import {
  AField,
  AGhost,
  AHead,
  AInput,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { normalizeSlug } from "@features/items/items-model.ts"
import {
  DANGER_BTN_STYLE,
  PRICE_INPUT_STYLE,
} from "./items-styles.ts";

export interface ItemFormState {
  /** SKU. Empty in "new" mode → mutation auto-generates one. */
  id: string;
  name: string;
  /** Raw user text — converted to a number on submit. */
  price: string;
}

export const BLANK_ITEM_FORM: ItemFormState = { id: "", name: "", price: "" };

export interface ItemsItemFormProps {
  mode: "new" | "edit";
  form: ItemFormState;
  setForm: (next: ItemFormState) => void;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
  /** Only wired in edit mode. */
  onDelete?: () => void;
}

export function ItemsItemForm({
  mode,
  form,
  setForm,
  error,
  busy,
  onBack,
  onSubmit,
  onDelete,
}: ItemsItemFormProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const disabled = busy || form.name.trim() === "" || form.price.trim() === "";
  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead
        eyebrow={mode === "edit" ? "Edit item" : "New item"}
        title={mode === "edit" ? "Update" : "Add an"}
        size={30}
      />
      <div
        style={{
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 30,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: COLOR.text3,
          marginTop: -4,
          marginBottom: 16,
        }}
      >
        {mode === "edit" ? "this item." : "item."}
      </div>

      <AField label="Item name" hint="e.g. Tequila Shot, Margherita, Espresso.">
        <AInput
          autoFocus
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Tequila Shot"
        />
      </AField>

      <AField label="Price · CASH" error={error ?? undefined}>
        <div
          style={{
            background: COLOR.surface,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 10,
            padding: "12px 14px",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
          }}
        >
          <input
            inputMode="decimal"
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })
            }
            placeholder="0.00"
            style={PRICE_INPUT_STYLE}
          />
          <span style={{ fontSize: 11, color: COLOR.muted, letterSpacing: "0.12em" }}>CASH</span>
        </div>
      </AField>

      <AField label="SKU" hint="Stable identifier sent with each receipt. Auto-generated if empty.">
        <AInput
          value={form.id}
          onChange={(v) => setForm({ ...form, id: normalizeSlug(v) })}
          placeholder="sku-001"
          mono
        />
      </AField>

      <div style={{ height: 8 }} />
      <APrimary onClick={onSubmit} disabled={disabled}>
        {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Add item"}
      </APrimary>
      {mode === "edit" && onDelete ? (
        <>
          <div style={{ height: 10 }} />
          {confirmingDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <ASecondary full={false} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </ASecondary>
              <APrimary danger full={false} disabled={busy} onClick={busy ? undefined : onDelete}>
                Confirm delete
              </APrimary>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} style={DANGER_BTN_STYLE}>
              Delete item
            </button>
          )}
        </>
      ) : null}
    </>
  );
}
