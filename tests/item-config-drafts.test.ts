/**
 * Local draft layer for item configs.
 *
 * Drafts are persisted via the host KV store; published snapshots come
 * from the contract + Bulletin envelope fetch. The Items tab compares
 * draft-vs-snapshot to compute "needs publishing" UI state.
 */

import { describe, expect, it } from "vitest";

import type { ItemConfig } from "@features/items/items-model.ts";
import {
  decodeDraftsOrFallback,
  decodeDraftsPayload,
  dirtyConfigIds,
  encodeDraftsPayload,
  isConfigDirty,
  reconcilePublishedConfigs,
  sameConfigContent,
  type PublishedConfigSnapshot,
} from "@features/items/item-config-drafts.ts";

const bar: ItemConfig = {
  id: "bar",
  name: "Bar",
  updatedAt: "2026-01-01T00:00:00Z",
  items: [
    { id: "sku-001", name: "Tequila Shot", price: 4 },
    { id: "sku-003", name: "Pils 0.5L", price: 5 },
  ],
};

function snapshotOf(config: ItemConfig, cid = "cid-bar"): PublishedConfigSnapshot {
  return {
    configId: config.id,
    cid,
    size: 256,
    updatedAt: "2026-05-01T00:00:00Z",
    snapshot: config,
  };
}

describe("draft payload codec", () => {
  it("encodes configs + base as a stable v2 shape", () => {
    const payload = encodeDraftsPayload([bar], [bar]);
    expect(payload.version).toBe(2);
    expect(payload.configs).toEqual([bar]);
    expect(payload.base).toEqual([bar]);
  });

  it("roundtrips encode → decode", () => {
    const encoded = encodeDraftsPayload([bar], [bar]);
    const decoded = decodeDraftsPayload(encoded);
    expect(decoded?.configs).toEqual([bar]);
    expect(decoded?.base).toEqual([bar]);
  });

  it("returns null on a missing or unknown-version payload", () => {
    expect(decodeDraftsPayload(null)).toBeNull();
    expect(decodeDraftsPayload({ version: 99, configs: [] })).toBeNull();
    expect(decodeDraftsPayload({ version: 2, configs: "nope" })).toBeNull();
  });

  it("migrates a v1 payload by treating its drafts as the reconcile base", () => {
    const decoded = decodeDraftsPayload({ version: 1, configs: [bar] });
    expect(decoded?.configs).toEqual([bar]);
    expect(decoded?.base).toEqual([bar]);
  });

  it("falls back to the supplied list when decode fails", () => {
    const fallback = [bar];
    expect(decodeDraftsOrFallback(null, fallback)).toBe(fallback);
    expect(decodeDraftsOrFallback({ junk: true }, fallback)).toBe(fallback);
  });

  it("flattens legacy category-shaped configs into the new flat shape", () => {
    const legacyPayload = {
      version: 1,
      configs: [
        {
          id: "old",
          name: "Old",
          updatedAt: "2026-01-01T00:00:00Z",
          categories: [
            { id: "cat-a", name: "A", items: [{ id: "sku-1", name: "One", price: 1 }] },
            { id: "cat-b", name: "B", items: [{ id: "sku-2", name: "Two", price: 2 }] },
          ],
        },
      ],
    };
    const decoded = decodeDraftsPayload(legacyPayload);
    expect(decoded).not.toBeNull();
    expect(decoded?.configs[0]?.items.map((i) => i.id)).toEqual(["sku-1", "sku-2"]);
  });
});

describe("sameConfigContent", () => {
  it("matches the dirty diff's content equality (updatedAt ignored)", () => {
    expect(sameConfigContent(bar, { ...bar, updatedAt: "2030-01-01T00:00:00Z" })).toBe(true);
    expect(sameConfigContent(bar, { ...bar, name: "Bar 2" })).toBe(false);
  });
});

describe("dirty diff", () => {
  it("is dirty when no snapshot exists yet", () => {
    expect(isConfigDirty(bar, null)).toBe(true);
  });

  it("is clean when draft and snapshot match exactly", () => {
    expect(isConfigDirty(bar, bar)).toBe(false);
  });

  it("flags a renamed config", () => {
    expect(isConfigDirty({ ...bar, name: "Bar 2" }, bar)).toBe(true);
  });

  it("flags a re-ordered items list", () => {
    const swapped: ItemConfig = { ...bar, items: [bar.items[1]!, bar.items[0]!] };
    expect(isConfigDirty(swapped, bar)).toBe(true);
  });

  it("flags a price tweak", () => {
    const bumped: ItemConfig = {
      ...bar,
      items: [{ ...bar.items[0]!, price: 4.5 }, bar.items[1]!],
    };
    expect(isConfigDirty(bumped, bar)).toBe(true);
  });

  it("ignores updatedAt drift", () => {
    expect(isConfigDirty({ ...bar, updatedAt: "2027-01-01T00:00:00Z" }, bar)).toBe(false);
  });

  it("collects dirty config ids across a batch", () => {
    const cafe: ItemConfig = {
      id: "cafe",
      name: "Café",
      updatedAt: "2026-01-01T00:00:00Z",
      items: [{ id: "sku-201", name: "Espresso", price: 2.2 }],
    };
    const snapshots = new Map<string, PublishedConfigSnapshot>([
      [bar.id, snapshotOf(bar)],
      // cafe has no snapshot → counted as dirty.
    ]);
    expect(dirtyConfigIds([bar, cafe], snapshots)).toEqual(["cafe"]);
  });
});

describe("reconcilePublishedConfigs", () => {
  const cafe: ItemConfig = {
    id: "cafe",
    name: "Café",
    updatedAt: "2026-01-01T00:00:00Z",
    items: [{ id: "sku-201", name: "Espresso", price: 2.2 }],
  };
  const barEdited: ItemConfig = { ...bar, name: "Bar 2" };

  function published(...configs: ReadonlyArray<ItemConfig>): Map<string, PublishedConfigSnapshot> {
    const map = new Map<string, PublishedConfigSnapshot>();
    for (const config of configs) map.set(config.id, snapshotOf(config, `cid-${config.id}`));
    return map;
  }
  function baseOf(...configs: ReadonlyArray<ItemConfig>): ReadonlyMap<string, ItemConfig> {
    return new Map(configs.map((config) => [config.id, config]));
  }
  const noBase: ReadonlyMap<string, ItemConfig> = new Map();

  it("returns null when the registry has no resolved bodies", () => {
    expect(reconcilePublishedConfigs([], noBase, new Map())).toBeNull();
    const unresolved = new Map<string, PublishedConfigSnapshot>([
      [bar.id, { ...snapshotOf(bar), snapshot: null }],
    ]);
    expect(reconcilePublishedConfigs([], noBase, unresolved)).toBeNull();
  });

  it("adopts every published config on a fresh (empty) device", () => {
    const result = reconcilePublishedConfigs([], noBase, published(bar, cafe));
    expect(result?.configs).toEqual([bar, cafe]);
    expect([...(result?.base.keys() ?? [])]).toEqual(["bar", "cafe"]);
  });

  it("adopts a peer's change when the draft has no edits since its base", () => {
    // Mirrors a v1-migrated or previously-synced device: base === draft.
    const result = reconcilePublishedConfigs([bar], baseOf(bar), published(barEdited));
    expect(result?.configs).toEqual([barEdited]);
    expect(result?.base.get("bar")).toEqual(barEdited);
  });

  it("adopts a brand-new peer config without touching untouched locals", () => {
    const result = reconcilePublishedConfigs([bar], baseOf(bar), published(bar, cafe));
    expect(result?.configs).toEqual([bar, cafe]);
  });

  it("keeps an in-progress local edit (no-op) instead of clobbering it", () => {
    // Local edited bar→barEdited; chain still has the original bar.
    expect(reconcilePublishedConfigs([barEdited], baseOf(bar), published(bar))).toBeNull();
  });

  it("keeps the local edit on a true conflict (both sides changed)", () => {
    const barOther: ItemConfig = { ...bar, name: "Bar 3" };
    expect(reconcilePublishedConfigs([barEdited], baseOf(bar), published(barOther))).toBeNull();
  });

  it("pins the base to the chain after the device publishes its edit", () => {
    const result = reconcilePublishedConfigs([barEdited], baseOf(bar), published(barEdited));
    expect(result?.configs).toEqual([barEdited]);
    expect(result?.base.get("bar")).toEqual(barEdited);
  });

  it("is a no-op once the device is fully in sync", () => {
    expect(reconcilePublishedConfigs([bar], baseOf(bar), published(bar))).toBeNull();
  });

  it("does not resurrect a config deleted locally after a prior sync", () => {
    // `bar` was synced (tombstone in base), then deleted from drafts.
    expect(reconcilePublishedConfigs([], baseOf(bar), published(bar))).toBeNull();
  });
});
