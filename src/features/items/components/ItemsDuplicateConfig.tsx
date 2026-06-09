// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  ADotted,
  AEye,
  AField,
  AGhost,
  AHead,
  AInput,
  AMono,
  APrimary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { normalizeSlug, type ItemConfig } from "@features/items/items-model.ts";
import type { NewConfigForm } from "./ItemsNewConfig.tsx";

export interface ItemsDuplicateConfigProps {
  source: ItemConfig;
  form: NewConfigForm;
  setForm: (next: NewConfigForm) => void;
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function ItemsDuplicateConfig({
  source,
  form,
  setForm,
  error,
  busy,
  onBack,
  onSubmit,
}: ItemsDuplicateConfigProps) {
  const items = source.items;
  const sampleNames = items.slice(0, 4).map((i) => i.name);
  const disabled = busy || form.name.trim() === "" || form.id.trim() === "";

  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="Duplicate" title="Copy & customize" size={28} />
      <div
        style={{
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 26,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: COLOR.text3,
          marginTop: -2,
          marginBottom: 14,
        }}
      >
        from {source.name}.
      </div>

      <ACard padding={14}>
        <AEye>Source</AEye>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 20, letterSpacing: "-0.02em" }}>{source.name}</div>
          <AMono size={11} color={COLOR.muted}>{source.id}</AMono>
        </div>
        <ADotted margin={10} />
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: COLOR.text3 }}>
          <span>
            <AMono size={12} color={COLOR.text2}>{items.length}</AMono> items
          </span>
        </div>
        {sampleNames.length > 0 ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: COLOR.muted,
              fontStyle: "italic",
              fontFamily: FONT.serif,
              lineHeight: 1.5,
            }}
          >
            {sampleNames.join(" · ")}
            {items.length > sampleNames.length ? " …" : ""}
          </div>
        ) : null}
      </ACard>

      <div style={{ height: 14 }} />

      <AField label="New display name">
        <AInput
          autoFocus
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          placeholder={`${source.name} (copy)`}
        />
      </AField>

      <AField
        label="New config ID"
        hint="Terminals reference this ID. Must be unique."
        error={error ?? undefined}
      >
        <AInput
          value={form.id}
          onChange={(v) => setForm({ ...form, id: normalizeSlug(v) })}
          placeholder={`${source.id}-copy`}
          mono
        />
      </AField>

      <div
        style={{
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.22)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginTop: 6,
        }}
      >
        <span style={{ color: COLOR.green, marginTop: 1 }}>
          <Icon name="shield-check" size={14} />
        </span>
        <div style={{ fontSize: 12, color: COLOR.text2, lineHeight: 1.5 }}>
          All <strong>{items.length}</strong> items will be copied. Edit prices and add new items afterwards without affecting the original.
        </div>
      </div>

      <div style={{ height: 18 }} />
      <APrimary onClick={onSubmit} disabled={disabled}>
        {busy ? "Duplicating…" : "Duplicate config"}
      </APrimary>
    </>
  );
}
