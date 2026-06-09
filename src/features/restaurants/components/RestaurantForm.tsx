// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";

import { Icon } from "@shared/components/Icon.tsx";
import {
  ADotted,
  AField,
  AGhost,
  AHead,
  AInput,
  AMono,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { normalizeSlug } from "@features/items/items-model.ts"
import type { RestaurantForm as RestaurantFormState } from "@features/restaurants/restaurants.ts";
import type { TxStatus } from "@/shared/chain/contracts/index.ts";

import { DANGER_BTN_STYLE } from "@features/items/components/items-styles.ts";
import { RestaurantContactFields } from "@features/restaurants/components/RestaurantContactFields.tsx";

export type { RestaurantFormState };

export type RestaurantFormMode = "new" | "edit";

export interface RestaurantFormProps {
  mode: RestaurantFormMode;
  form: RestaurantFormState;
  setForm: (next: RestaurantFormState) => void;
  error: string | null;
  busy?: boolean;
  txStatus?: TxStatus | null;
  cancelLabel?: string;
  onBack: () => void;
  onSubmit: () => void;
  onDelete?: () => void;
}

export function RestaurantForm({
  mode,
  form,
  setForm,
  error,
  busy = false,
  txStatus = null,
  cancelLabel,
  onBack,
  onSubmit,
  onDelete,
}: RestaurantFormProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isNew = mode === "new";
  const disabled =
    busy ||
    form.name.trim() === "" ||
    form.id.trim() === "" ||
    form.merchantId.trim() === "";
  const submitLabel = busy ? "Publishing…" : isNew ? "Create restaurant" : "Save changes";

  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> {cancelLabel ?? (isNew ? "Cancel" : "Back")}
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead
        eyebrow={isNew ? "New restaurant" : "Restaurant"}
        title={isNew ? "Add a" : "Edit"}
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
        {isNew ? "restaurant." : "details."}
      </div>

      {!isNew ? (
        <div
          style={{
            marginTop: -4,
            marginBottom: 14,
            fontSize: 11,
            color: COLOR.muted,
            lineHeight: 1.5,
          }}
        >
          Restaurant ID is fixed once created. T3rminals embed these
          fields verbatim into their QR receipt header.
        </div>
      ) : null}

      <AField
        label="Restaurant ID"
        hint="Internal slug — lowercase letters, numbers and dashes. Locked after creation."
      >
        {isNew ? (
          <AInput
            value={form.id}
            onChange={(v) => setForm({ ...form, id: normalizeSlug(v) })}
            placeholder="funkhaus-berlin"
            mono
          />
        ) : (
          <div
            style={{
              padding: "12px 14px",
              background: COLOR.surface2,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 10,
              color: COLOR.text2,
            }}
          >
            <AMono size={13} color={COLOR.text2}>{form.id}</AMono>
          </div>
        )}
      </AField>

      <AField
        label="Restaurant name"
        hint="Legal / display name printed on the receipt header."
      >
        <AInput
          autoFocus
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Funkhaus Berlin Events GmbH"
        />
      </AField>
      <AField
        label="Merchant ID"
        hint="Merchant code embedded in the payment-processor config profile — distinct from the restaurant ID (group)."
      >
        <AInput
          value={form.merchantId}
          onChange={(v) => setForm({ ...form, merchantId: v })}
          placeholder="funkhaus"
          mono
        />
      </AField>
      <RestaurantContactFields form={form} setForm={setForm} />

      <ADotted margin={6} />

      <div
        style={{
          background: "rgba(96,165,250,0.06)",
          border: "1px solid rgba(96,165,250,0.22)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginTop: 10,
        }}
      >
        <span style={{ color: COLOR.blue, marginTop: 1 }}>
          <Icon name="info" size={14} />
        </span>
        <div style={{ fontSize: 12, color: COLOR.text2, lineHeight: 1.5 }}>
          Saved on-chain to the registry as a merchant profile, and embedded
          inline into each T3rminal QR you regenerate.
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            border: `1px solid ${COLOR.red}`,
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
            color: COLOR.redSoft,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ height: 18 }} />
      <APrimary onClick={onSubmit} disabled={disabled}>
        {submitLabel}
      </APrimary>
      {busy && txStatus ? (
        <div style={{ marginTop: 10, fontSize: 12, color: COLOR.muted }}>
          {txStatus}…
        </div>
      ) : null}

      {!isNew && onDelete ? (
        <>
          <div style={{ height: 20 }} />
          {confirmingDelete ? (
            <div style={{ display: "flex", gap: 8 }}>
              <ASecondary full={false} onClick={() => setConfirmingDelete(false)}>
                Cancel
              </ASecondary>
              <APrimary danger full={false} onClick={onDelete}>
                Confirm delete
              </APrimary>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} style={DANGER_BTN_STYLE}>
              Delete restaurant
            </button>
          )}
        </>
      ) : null}
    </>
  );
}
