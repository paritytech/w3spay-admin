/**
 * Local draft layer for item configs.
 *
 * Drafts are persisted via the host KV store; published snapshots come
 * from the contract + Bulletin envelope fetch. The Items tab compares
 * draft-vs-snapshot to compute "needs publishing" UI state.
 */

import { describe, expect, it } from "vitest";

import { ITEM_CONFIGS_SEED } from "@features/items/items-mock.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import {
  decodeDraftsOrFallback,
  decodeDraftsPayload,
  dirtyConfigIds,
  encodeDraftsPayload,
  isConfigDirty,
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
  it("encodes the version + configs as a stable shape", () => {
    const payload = encodeDraftsPayload([bar]);
    expect(payload.version).toBe(1);
    expect(payload.configs).toEqual([bar]);
  });

  it("roundtrips encode → decode", () => {
    const encoded = encodeDraftsPayload([bar]);
    const decoded = decodeDraftsPayload(encoded);
    expect(decoded).toEqual([bar]);
  });

  it("returns null on a missing or wrong-version payload", () => {
    expect(decodeDraftsPayload(null)).toBeNull();
    expect(decodeDraftsPayload({ version: 99, configs: [] })).toBeNull();
    expect(decodeDraftsPayload({ version: 1, configs: "nope" })).toBeNull();
  });

  it("falls back to the seed list when decode fails", () => {
    expect(decodeDraftsOrFallback(null, ITEM_CONFIGS_SEED)).toBe(ITEM_CONFIGS_SEED);
    expect(decodeDraftsOrFallback({ junk: true }, ITEM_CONFIGS_SEED)).toBe(ITEM_CONFIGS_SEED);
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
    expect(decoded?.[0]?.items.map((i) => i.id)).toEqual(["sku-1", "sku-2"]);
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
