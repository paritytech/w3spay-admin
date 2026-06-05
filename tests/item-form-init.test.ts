import { describe, expect, it } from "vitest";

import type { ItemsView } from "@features/items/pages/ItemsTab.tsx";
import type { ItemConfig } from "@features/items/items-model.ts";
import {
  duplicateFormForRoute,
  itemFormForRoute,
} from "@features/items/components/item-form-init.ts";

/**
 * The form-init helpers are the fix for the "edit screen opens blank"
 * bug: ItemsTab remounts on every intra-tab navigation, so the form's
 * initial state must be derivable from the route alone. These tests pin
 * that derivation — they would fail if a future change went back to
 * threading values through navigation callbacks.
 */

const DRINKS: ItemConfig = {
  id: "drinks",
  name: "Drinks",
  updatedAt: "2026-01-01T00:00:00.000Z",
  items: [
    { id: "espresso", name: "Espresso", price: 2.5 },
    { id: "negroni", name: "Negroni", price: 9 },
  ],
};
const CONFIGS: ReadonlyArray<ItemConfig> = [DRINKS];

const BLANK_ITEM = { id: "", name: "", price: "" };
const BLANK_NEW = { name: "", id: "" };

describe("itemFormForRoute", () => {
  it("populates sku, name, and price for the edited item", () => {
    const view: ItemsView = {
      kind: "item-edit",
      configId: "drinks",
      itemId: "negroni",
    };
    expect(itemFormForRoute(view, CONFIGS)).toEqual({
      id: "negroni",
      name: "Negroni",
      price: "9",
    });
  });

  it("renders the price as a plain decimal string", () => {
    const view: ItemsView = {
      kind: "item-edit",
      configId: "drinks",
      itemId: "espresso",
    };
    expect(itemFormForRoute(view, CONFIGS).price).toBe("2.5");
  });

  it("is blank for a new item", () => {
    const view: ItemsView = { kind: "item-new", configId: "drinks" };
    expect(itemFormForRoute(view, CONFIGS)).toEqual(BLANK_ITEM);
  });

  it("is blank when the item id is absent (route raced a delete)", () => {
    const view: ItemsView = {
      kind: "item-edit",
      configId: "drinks",
      itemId: "ghost",
    };
    expect(itemFormForRoute(view, CONFIGS)).toEqual(BLANK_ITEM);
  });

  it("is blank when the config is absent", () => {
    const view: ItemsView = {
      kind: "item-edit",
      configId: "missing",
      itemId: "negroni",
    };
    expect(itemFormForRoute(view, CONFIGS)).toEqual(BLANK_ITEM);
  });

  it("is blank for unrelated routes", () => {
    expect(itemFormForRoute({ kind: "list" }, CONFIGS)).toEqual(BLANK_ITEM);
    expect(itemFormForRoute({ kind: "detail", configId: "drinks" }, CONFIGS)).toEqual(
      BLANK_ITEM,
    );
  });
});

describe("duplicateFormForRoute", () => {
  it("pre-fills the (copy) name and slug from the source config", () => {
    const view: ItemsView = { kind: "duplicate", sourceId: "drinks" };
    expect(duplicateFormForRoute(view, CONFIGS)).toEqual({
      name: "Drinks (copy)",
      id: "drinks-copy",
    });
  });

  it("is blank when the source config is gone", () => {
    const view: ItemsView = { kind: "duplicate", sourceId: "missing" };
    expect(duplicateFormForRoute(view, CONFIGS)).toEqual(BLANK_NEW);
  });

  it("is blank for unrelated routes", () => {
    expect(duplicateFormForRoute({ kind: "new" }, CONFIGS)).toEqual(BLANK_NEW);
  });
});
