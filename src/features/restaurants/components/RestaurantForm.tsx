/**
 * Restaurants tab — create or edit a restaurant profile.
 *
 * A single form covering both modes: `mode === "new"` exposes the slug
 * `id` input and emits a "Create" CTA; `mode === "edit"` locks the id
 * (records are keyed by it) and emits a "Save changes" CTA alongside a
 * delete affordance.
 *
 * Pure presentational — mutations bubble up to the orchestrator.
 */

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
import { slugify } from "@features/items/items-model.ts";
import type { RestaurantForm as RestaurantFormState } from "@features/restaurants/restaurants.ts";

import { DANGER_BTN_STYLE } from "@features/items/components/items-styles.ts";

export type { RestaurantFormState };

export type RestaurantFormMode = "new" | "edit";

export interface RestaurantFormProps {
  mode: RestaurantFormMode;
  form: RestaurantFormState;
  setForm: (next: RestaurantFormState) => void;
  /** Validation/persistence error to surface near the submit button. */
  error: string | null;
  /** Hint shown next to the back button — context (e.g. "Configure T3rminal"). */
  cancelLabel?: string;
  onBack: () => void;
  onSubmit: () => void;
  /** Present only in edit mode. */
  onDelete?: () => void;
}

export function RestaurantForm({
  mode,
  form,
  setForm,
  error,
  cancelLabel,
  onBack,
  onSubmit,
  onDelete,
}: RestaurantFormProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isNew = mode === "new";
  const disabled = form.name.trim() === "" || form.id.trim() === "";
  const submitLabel = isNew ? "Create restaurant" : "Save changes";

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
            onChange={(v) => setForm({ ...form, id: slugify(v) })}
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
      <AField label="Address line 1">
        <AInput
          value={form.addressLine1}
          onChange={(v) => setForm({ ...form, addressLine1: v })}
          placeholder="Nalepastraße 18"
        />
      </AField>
      <AField label="Address line 2">
        <AInput
          value={form.addressLine2}
          onChange={(v) => setForm({ ...form, addressLine2: v })}
          placeholder="12459 Berlin"
        />
      </AField>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <AField label="Phone">
          <AInput
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            placeholder="030/12085416"
          />
        </AField>
        <AField label="Tax / VAT ID">
          <AInput
            value={form.taxId}
            onChange={(v) => setForm({ ...form, taxId: v })}
            placeholder="DE263789123"
          />
        </AField>
      </div>

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
          Restaurant profiles never hit chain — they live on this admin
          device only and ride into the QR each time you regenerate one.
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
