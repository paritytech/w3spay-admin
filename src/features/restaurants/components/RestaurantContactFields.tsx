// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { RestaurantForm } from "@features/restaurants/restaurants.ts";
import { AField, AInput } from "@shared/components/primitives.tsx";

/** Optional receipt-header fields: address, phone, tax id. */
export function RestaurantContactFields({
  form,
  setForm,
}: {
  form: RestaurantForm;
  setForm: (next: RestaurantForm) => void;
}) {
  return (
    <>
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
    </>
  );
}
