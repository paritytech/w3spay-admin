/**
 * Restaurants tab — list of stored restaurant profiles.
 *
 * Read-only. The "New restaurant" CTA lives in the page footer wired
 * by the tab orchestrator so it stays sticky on small screens. Each
 * row drills into a `RestaurantForm` edit screen.
 */

import {
  ACard,
  AHead,
  AMono,
} from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import type { Restaurant } from "@features/restaurants/restaurants.ts";

export interface RestaurantsListProps {
  restaurants: ReadonlyArray<Restaurant>;
  onOpen: (id: string) => void;
}

export function RestaurantsList({ restaurants, onOpen }: RestaurantsListProps) {
  const total = restaurants.length;

  return (
    <>
      <AHead eyebrow="Directory" title="Restaurants" size={32} />
      <div
        style={{
          color: COLOR.text3,
          fontSize: 13,
          marginTop: -6,
          marginBottom: 14,
          fontStyle: "italic",
          fontFamily: FONT.serif,
        }}
      >
        Receipt-header profiles embedded inline into each T3rminal QR.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <Counter label="Restaurants" value={total} />
      </div>

      {restaurants.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            color: COLOR.muted,
            background: COLOR.surface,
            border: `1px dashed ${COLOR.border}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontFamily: FONT.serif,
              fontStyle: "italic",
              fontSize: 18,
              color: COLOR.text3,
              marginBottom: 6,
            }}
          >
            No restaurants yet.
          </div>
          <div style={{ fontSize: 12 }}>
            Create one to attach a name, address, and tax id to a T3rminal QR.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {restaurants.map((r) => (
            <RestaurantRow key={r.id} restaurant={r} onClick={() => onOpen(r.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        background: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 999,
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: COLOR.muted }}>
        {label}
      </span>
      <AMono size={12}>{value}</AMono>
    </div>
  );
}

function RestaurantRow({ restaurant, onClick }: { restaurant: Restaurant; onClick: () => void }) {
  const { id, profile } = restaurant;
  const secondary = [profile.addressLine1, profile.addressLine2].filter(Boolean).join(" · ");
  return (
    <ACard onClick={onClick} padding={14}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: 20,
                letterSpacing: "-0.02em",
                color: COLOR.text,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {profile.name}
            </div>
            <AMono size={10} color={COLOR.faint} weight={400}>
              {id}
            </AMono>
          </div>
          {secondary ? (
            <div
              style={{
                fontSize: 11,
                color: COLOR.text3,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: "italic",
                fontFamily: FONT.serif,
              }}
            >
              {secondary}
            </div>
          ) : null}
          {profile.phone || profile.taxId ? (
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 6,
                fontSize: 11,
                color: COLOR.muted,
              }}
            >
              {profile.phone ? <span>☏ {profile.phone}</span> : null}
              {profile.taxId ? (
                <span>
                  <AMono size={10} color={COLOR.muted}>{profile.taxId}</AMono>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div style={{ color: COLOR.faint, flexShrink: 0, alignSelf: "center" }}>
          <Icon name="chevron-right" size={16} />
        </div>
      </div>
    </ACard>
  );
}
