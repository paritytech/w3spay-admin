/**
 * Items tab — list of catalogue configs. Each row drills into a
 * `ItemsDetail`. Counters reflect the live shape: number of configs and
 * total items across all configs.
 *
 * Read-only. The "New config" CTA lives in the page footer wired by the
 * tab orchestrator so it stays sticky on small screens.
 */

import {
  ACard,
  AHead,
  AMono,
} from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { timeAgoFromIso } from "@features/merchant/merchant-model.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

export interface ItemsListProps {
  configs: ReadonlyArray<ItemConfig>;
  dirtyCount: number;
  onOpen: (configId: string) => void;
}

export function ItemsList({ configs, dirtyCount, onOpen }: ItemsListProps) {
  const totalItems = configs.reduce((s, c) => s + c.items.length, 0);

  return (
    <>
      <AHead eyebrow="Catalogue" title="Items" size={32} />
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
        Menus &amp; pricing — pulled by terminals at startup.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <Counter label="Configs" value={configs.length} />
        <Counter label="Items" value={totalItems} />
        {dirtyCount > 0 ? <Counter label="Unsaved" value={dirtyCount} accent={COLOR.redSoft} /> : null}
      </div>

      {configs.length === 0 ? (
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
          <div style={{ fontFamily: FONT.serif, fontStyle: "italic", fontSize: 18, color: COLOR.text3, marginBottom: 6 }}>
            No configs yet.
          </div>
          <div style={{ fontSize: 12 }}>Create one to start populating menus.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {configs.map((c) => (
            <ConfigRow key={c.id} config={c} onClick={() => onOpen(c.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        background: COLOR.surface,
        border: `1px solid ${accent ?? COLOR.border}`,
        borderRadius: 999,
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: accent ?? COLOR.muted }}>
        {label}
      </span>
      <AMono size={12} color={accent ?? undefined}>{value}</AMono>
    </div>
  );
}

function ConfigRow({ config, onClick }: { config: ItemConfig; onClick: () => void }) {
  const items = config.items;
  const itemNames = items.map((i) => i.name);
  const preview = itemNames.slice(0, 3).join(" · ") + (itemNames.length > 3 ? " …" : "");
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
              }}
            >
              {config.name}
            </div>
            <AMono size={10} color={COLOR.faint} weight={400}>
              {config.id}
            </AMono>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: COLOR.muted,
              fontSize: 11,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <AMono size={11} color={COLOR.text2} weight={500}>
              {items.length}
            </AMono>
            <span>items</span>
            <span>·</span>
            <span style={{ color: COLOR.muted }}>updated {timeAgoFromIso(config.updatedAt)}</span>
          </div>
          {itemNames.length > 0 ? (
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
              {preview}
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

/** Placeholder shown while the published registry is still fetching.
 * Mirrors the ItemsList layout shape so there's no jump on load. */
export function ItemsListSkeleton() {
  const skel = (w: number | string, h: number, r = 6): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: r,
    background: COLOR.surface2,
    animation: "w3-pulse 1.4s ease-in-out infinite",
    flexShrink: 0,
  });

  return (
    <>
      {/* Header */}
      <div style={{ ...skel(52, 10, 4), marginBottom: 10 }} />
      <div style={{ ...skel(100, 28, 6), marginBottom: 8 }} />
      <div style={{ ...skel("72%", 13, 4), marginBottom: 18 }} />

      {/* Counter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <div style={skel(72, 28, 999)} />
        <div style={skel(72, 28, 999)} />
      </div>

      {/* Config card rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {([120, 88, 104] as const).map((titleW, i) => (
          <div
            key={i}
            style={{
              background: COLOR.surface,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...skel(titleW, 20, 5), marginBottom: 8 }} />
                <div style={{ ...skel("55%", 11, 4), marginBottom: 6 }} />
                <div style={{ ...skel("70%", 11, 4) }} />
              </div>
              <div style={{ ...skel(16, 16, 4), marginLeft: 10 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Button placeholders */}
      <div style={{ height: 14 }} />
      <div style={{ ...skel("100%", 36, 10) }} />
      <div style={{ height: 10 }} />
      <div style={{ ...skel("100%", 36, 10) }} />
    </>
  );
}
