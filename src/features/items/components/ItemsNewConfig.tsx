// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { Icon } from "@shared/components/Icon.tsx";
import {
  ADotted,
  AField,
  AGhost,
  AHead,
  AInput,
  APrimary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { normalizeSlug } from "@features/items/items-model.ts"

export interface NewConfigForm {
  name: string;
  id: string;
}

export const BLANK_NEW_CONFIG: NewConfigForm = { name: "", id: "" };

export interface ItemsNewConfigProps {
  form: NewConfigForm;
  setForm: (next: NewConfigForm) => void;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function ItemsNewConfig({ form, setForm, error, busy, onBack, onSubmit }: ItemsNewConfigProps) {
  const disabled = busy || form.name.trim() === "" || form.id.trim() === "";
  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="New config" title="Create a" size={30} />
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
        price list.
      </div>

      <AField label="Display name" hint="Shown to admins and on the merchant detail page.">
        <AInput
          autoFocus
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder="Bar · Funkhaus"
        />
      </AField>

      <AField
        label="Config ID"
        hint="What the terminal asks for. Lowercase letters, numbers and dashes."
        error={error ?? undefined}
      >
        <AInput
          value={form.id}
          onChange={(v) => setForm({ ...form, id: normalizeSlug(v) })}
          placeholder="bar"
          mono
        />
      </AField>

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
          You'll add categories and items after the config is created. Terminals
          fetch the latest version on every boot.
        </div>
      </div>

      <div style={{ height: 18 }} />
      <APrimary onClick={onSubmit} disabled={disabled}>
        {busy ? "Creating…" : "Create config"}
      </APrimary>
    </>
  );
}
