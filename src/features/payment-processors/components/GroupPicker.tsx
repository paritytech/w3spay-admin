// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { Restaurant } from "@features/restaurants/restaurants.ts";
import { ACard, AField, AMono } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export function GroupPicker({
  restaurants,
  selectedId,
  onSelect,
}: {
  restaurants: Restaurant[];
  selectedId: string;
  onSelect: (restaurant: Restaurant) => void;
}) {
  return (
    <AField label="Group" hint="The restaurant/merchant profile this config belongs to. Manage these in the Restaurants tab.">
      {restaurants.length === 0 ? (
        <div style={{ fontSize: 12, color: COLOR.faint, lineHeight: 1.5 }}>
          No restaurants yet — create one in the Restaurants tab first.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {restaurants.map((r) => (
            <ACard
              key={r.id}
              padding={12}
              onClick={() => onSelect(r)}
              style={selectedId === r.id ? { borderColor: COLOR.blue } : undefined}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: COLOR.text }}>{r.profile.name}</span>
                <AMono size={11} color={COLOR.faint}>{r.id}</AMono>
              </div>
              <div style={{ fontSize: 11, color: COLOR.faint, marginTop: 2 }}>merchantId: {r.merchantId}</div>
            </ACard>
          ))}
        </div>
      )}
    </AField>
  );
}
