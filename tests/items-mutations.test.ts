import { describe, expect, it } from "vitest";

import type { ItemConfig } from "@features/items/items-model.ts";
import {
  configFlatItems,
  findItemInConfig,
  normalizeLegacyItemConfigShape,
  parsePriceInput,
  slugify,
} from "@features/items/items-model.ts";
import {
  createConfig,
  deleteConfig,
  duplicateConfig,
} from "@features/items/items-mutations.ts";
import { deleteItem, upsertItem } from "@features/items/items-item-mutations.ts";

const NOW = Date.parse("2026-05-25T10:00:00Z");

function bar(): ItemConfig {
  return {
    id: "bar",
    name: "Bar",
    updatedAt: "2026-01-01T00:00:00Z",
    items: [
      { id: "sku-001", name: "Tequila Shot", price: 4 },
      { id: "sku-003", name: "Pils 0.5L", price: 5 },
    ],
  };
}

describe("items-model helpers", () => {
  it("slugify lowercases and collapses non-alphanum to dashes", () => {
    expect(slugify("Bar · Funkhaus 2")).toBe("bar-funkhaus-2");
    expect(slugify("  --hello-- ")).toBe("hello");
    expect(slugify("ALL CAPS")).toBe("all-caps");
  });

  it("parsePriceInput accepts comma + dot, rejects negatives and junk", () => {
    expect(parsePriceInput("4.50")).toBe(4.5);
    expect(parsePriceInput("4,50")).toBe(4.5);
    expect(parsePriceInput(" 10 ")).toBe(10);
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-1")).toBeNull();
  });

  it("configFlatItems returns config.items (passes null through to [])", () => {
    expect(configFlatItems(bar()).map((i) => i.id)).toEqual(["sku-001", "sku-003"]);
    expect(configFlatItems(null)).toEqual([]);
  });

  it("findItemInConfig returns the matching Item or null", () => {
    expect(findItemInConfig(bar(), "sku-003")?.name).toBe("Pils 0.5L");
    expect(findItemInConfig(bar(), "missing")).toBeNull();
  });
});

describe("legacy normalizer", () => {
  it("flattens category-shaped configs in category-major order", () => {
    const legacy = {
      id: "old",
      name: "Old config",
      updatedAt: "2026-01-01T00:00:00Z",
      categories: [
        { id: "cat-a", name: "Cat A", items: [
          { id: "sku-1", name: "One", price: 1 },
          { id: "sku-2", name: "Two", price: 2 },
        ] },
        { id: "cat-b", name: "Cat B", items: [
          { id: "sku-3", name: "Three", price: 3 },
        ] },
      ],
    };
    const flat = normalizeLegacyItemConfigShape(legacy);
    expect(flat).not.toBeNull();
    expect(flat?.items.map((i) => i.id)).toEqual(["sku-1", "sku-2", "sku-3"]);
  });

  it("passes through already-flat configs unchanged", () => {
    const flat = normalizeLegacyItemConfigShape({
      id: "x",
      name: "X",
      updatedAt: "2026-01-01T00:00:00Z",
      items: [{ id: "sku-1", name: "One", price: 1 }],
    });
    expect(flat?.items).toEqual([{ id: "sku-1", name: "One", price: 1 }]);
  });

  it("rejects non-object input", () => {
    expect(normalizeLegacyItemConfigShape(null)).toBeNull();
    expect(normalizeLegacyItemConfigShape("nope")).toBeNull();
    expect(normalizeLegacyItemConfigShape({ id: 123 })).toBeNull();
  });
});

describe("config mutations", () => {
  it("createConfig prepends a new config and rejects duplicate IDs", () => {
    const configs = [bar()];
    const ok = createConfig(configs, { name: "Cafe", id: "cafe" }, NOW);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.configs.map((c) => c.id)).toEqual(["cafe", "bar"]);

    const dup = createConfig(ok.configs, { name: "Bar 2", id: "bar" }, NOW);
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.kind).toBe("duplicate-config-id");
  });

  it("createConfig rejects empty/invalid IDs", () => {
    const res = createConfig([], { name: "X", id: "" }, NOW);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe("invalid-id");
  });

  it("duplicateConfig deep-copies the items array", () => {
    const configs = [bar()];
    const res = duplicateConfig(configs, "bar", { name: "Bar 2", id: "bar-2" }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const copy = res.result;
    expect(copy.id).toBe("bar-2");
    expect(copy.items).toHaveLength(2);
    // The items array must be a fresh ref so mutating the copy doesn't bleed.
    expect(copy.items[0]).not.toBe(configs[0]!.items[0]);
    // Source updatedAt is unchanged.
    expect(configs[0]!.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("deleteConfig removes the row when present and errors when missing", () => {
    const configs = [bar()];
    const ok = deleteConfig(configs, "bar");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.configs).toHaveLength(0);

    const miss = deleteConfig(configs, "missing");
    expect(miss.ok).toBe(false);
  });
});

describe("item mutations", () => {
  it("upsertItem appends to the items list when SKU is new", () => {
    const res = upsertItem([bar()], "bar", {
      id: "sku-099",
      name: "Helles",
      price: 4,
    }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const updated = res.configs[0]!;
    expect(updated.items.map((i) => i.id)).toEqual(["sku-001", "sku-003", "sku-099"]);
  });

  it("upsertItem replaces in place when SKU matches (edit)", () => {
    const res = upsertItem([bar()], "bar", {
      id: "sku-001",
      name: "Tequila Reposado",
      price: 5,
    }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const updated = res.configs[0]!;
    expect(updated.items).toHaveLength(2);
    expect(updated.items.find((i) => i.id === "sku-001")).toEqual({
      id: "sku-001",
      name: "Tequila Reposado",
      price: 5,
    });
  });

  it("upsertItem auto-generates an SKU when id is empty", () => {
    const res = upsertItem([bar()], "bar", { id: "", name: "Mystery", price: 1.5 }, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.id).toMatch(/^sku-\d{3,}$/);
    expect(res.result.id).not.toBe("sku-001");
  });

  it("deleteItem removes the row and errors when missing", () => {
    const res = deleteItem([bar()], "bar", "sku-001", NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.configs[0]!.items.map((i) => i.id)).toEqual(["sku-003"]);
    expect(deleteItem([bar()], "bar", "sku-nope", NOW).ok).toBe(false);
  });
});
