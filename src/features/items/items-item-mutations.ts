/**
 * Pure item-level mutations for the catalogue store.
 *
 * Lives alongside `items-mutations.ts` so the config mutations file
 * stays under the 200-line budget. The shared helper surface
 * (`MutationResult`, `touch`, `replaceConfig`, `nowIso`) is re-used from
 * that module.
 *
 * Operations target `ItemConfig.items` directly — the legacy category
 * layer was removed when item configs moved to the flat QR-payload
 * contract.
 */

import type { Item, ItemConfig } from "./items-model.ts";
import { slugify } from "./items-model.ts";
import {
  replaceConfig,
  touch,
  type MutationResult,
} from "./items-mutations.ts";

export interface UpsertItemArgs {
  /** SKU. Empty → mutation auto-generates one. */
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

export function upsertItem(
  configs: ReadonlyArray<ItemConfig>,
  configId: string,
  args: UpsertItemArgs,
  now: number,
): MutationResult<Item> {
  const config = configs.find((c) => c.id === configId);
  if (!config) return { ok: false, error: { kind: "not-found" } };
  const sku = slugify(args.id) || makeSku(config);
  const item: Item = { id: sku, name: args.name.trim(), price: args.price };
  const owns = config.items.some((i) => i.id === item.id);
  const items = owns
    ? config.items.map((i) => (i.id === item.id ? item : i))
    : [...config.items, item];
  const next = touch(config, now, (c) => ({ ...c, items }));
  return { ok: true, configs: replaceConfig(configs, next), result: item };
}

export function deleteItem(
  configs: ReadonlyArray<ItemConfig>,
  configId: string,
  itemId: string,
  now: number,
): MutationResult {
  const config = configs.find((c) => c.id === configId);
  if (!config) return { ok: false, error: { kind: "not-found" } };
  if (!config.items.some((i) => i.id === itemId))
    return { ok: false, error: { kind: "not-found" } };
  const next = touch(config, now, (c) => ({
    ...c,
    items: c.items.filter((i) => i.id !== itemId),
  }));
  return { ok: true, configs: replaceConfig(configs, next), result: next };
}

// ── Internals ───────────────────────────────────────────────────────

function makeSku(config: ItemConfig): string {
  const taken = new Set(config.items.map((i) => i.id));
  for (let i = 1; i < 10_000; i += 1) {
    const candidate = `sku-${String(i).padStart(3, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `sku-${Date.now()}`;
}
