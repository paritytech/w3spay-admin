// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Price denomination — CASH, expressed as a non-negative decimal number. */
export type CASH = number;

export interface Item {
  /** Stable SKU shipped with each receipt. */
  readonly id: string;
  readonly name: string;
  /** Price in CASH (e.g. 4.50). Always non-negative. */
  readonly price: CASH;
}

export interface ItemConfig {
  /** Lowercase slug — what the terminal asks for. Must be unique across configs. */
  readonly id: string;
  readonly name: string;
  readonly items: ReadonlyArray<Item>;
  /** ISO timestamp of the last mutation; updated by every write. */
  readonly updatedAt: string;
}

/** Return the items of a config — kept as a function so legacy callers compile cleanly. */
export function configFlatItems(c: ItemConfig | null | undefined): ReadonlyArray<Item> {
  if (!c) return [];
  return c.items;
}

/**
 * Locate an item by id inside a config. Returns the item itself — there
 * is no owning category in the new model. `null` when the id is absent
 * (mutations may race with renders, so callers MUST handle it).
 */
export function findItemInConfig(c: ItemConfig, itemId: string): Item | null {
  return c.items.find((i) => i.id === itemId) ?? null;
}

/**
 * Slugify a display string into a URL/contract-safe identifier:
 * lowercase ASCII letters, digits, and `-`. Empty input → empty string,
 * which callers MUST validate before persisting.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalize a slug while the user is still typing. Same rules as `slugify`
 * but does NOT strip a trailing dash, so the user can type "foo-bar" without
 * the dash being swallowed after "foo-". The final value should still pass
 * through `slugify` before being persisted.
 */
export function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-/, "")
    .replace(/-{2,}/g, "-");
}

/** Format a CASH amount as a 2-decimal display string (no token suffix). */
export function fmtCASH(n: CASH): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Parse a user-entered price string. Accepts `,` or `.` as the decimal
 * separator. Returns `null` for any input that doesn't parse to a finite
 * non-negative number. Used by the item-form on submit; the input box
 * itself does looser keystroke-level sanitisation.
 */
export function parsePriceInput(raw: string): CASH | null {
  const cleaned = raw.replace(",", ".").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

/** Subset of the old category-shaped config we still know how to decode. */
interface LegacyCategoryItem {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly price?: unknown;
}
interface LegacyCategory {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly items?: ReadonlyArray<LegacyCategoryItem> | unknown;
}

/**
 * Accept any plausible-looking config payload and return the flat shape.
 * Handles three input flavours:
 *
 *  1. Already-flat configs (`{ items: [...] }`) — pass through unchanged.
 *  2. Legacy category-shaped configs (`{ categories: [...] }`) — flatten
 *     items in category-major order, preserving SKU order inside each.
 *  3. Anything else — `null`, signalling "do not import".
 *
 * Returns `null` rather than throwing so call sites can fall back to a
 * seed config without try/catching.
 */
export function normalizeLegacyItemConfigShape(input: unknown): ItemConfig | null {
  if (typeof input !== "object" || input === null) return null;
  const obj = input as {
    id?: unknown;
    name?: unknown;
    updatedAt?: unknown;
    items?: unknown;
    categories?: unknown;
  };
  if (typeof obj.id !== "string" || typeof obj.name !== "string") return null;
  const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : new Date(0).toISOString();

  if (Array.isArray(obj.items)) {
    const items = obj.items
      .map(normalizeItem)
      .filter((it): it is Item => it !== null);
    return { id: obj.id, name: obj.name, items, updatedAt };
  }

  if (Array.isArray(obj.categories)) {
    const flat: Item[] = [];
    for (const cat of obj.categories as ReadonlyArray<LegacyCategory>) {
      if (!cat || typeof cat !== "object") continue;
      if (!Array.isArray(cat.items)) continue;
      for (const raw of cat.items) {
        const item = normalizeItem(raw);
        if (item) flat.push(item);
      }
    }
    return { id: obj.id, name: obj.name, items: flat, updatedAt };
  }

  return { id: obj.id, name: obj.name, items: [], updatedAt };
}

function normalizeItem(raw: unknown): Item | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as LegacyCategoryItem;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  if (typeof o.price !== "number" || !Number.isFinite(o.price) || o.price < 0) return null;
  return { id: o.id, name: o.name, price: o.price };
}
