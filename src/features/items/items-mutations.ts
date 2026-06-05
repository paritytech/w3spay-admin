/**
 * Pure mutation functions for item-configs (flat-items model).
 *
 * Each operation takes the current `configs` array and returns either a
 * new array (no in-place mutation) or a structured error. The hook in
 * `hooks/use-item-configs.ts` wraps these in `useState` setters; screen
 * code consumes them via that hook so the React layer never holds
 * mutation logic.
 *
 * Item-level mutations live alongside in `items-item-mutations.ts` so
 * the file stays under the 200-line budget; helpers are exported here so
 * both modules touch the same primitives.
 */

import type { ItemConfig } from "./items-model.ts";
import { slugify } from "./items-model.ts";

export type MutationError =
  | { kind: "duplicate-config-id"; id: string }
  | { kind: "invalid-id" }
  | { kind: "not-found" };

export type MutationResult<T = ItemConfig> =
  | { ok: true; configs: ReadonlyArray<ItemConfig>; result: T }
  | { ok: false; error: MutationError };

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function nowIso(now: number): string {
  return new Date(now).toISOString();
}

export function touch(
  config: ItemConfig,
  now: number,
  mutator: (c: ItemConfig) => ItemConfig,
): ItemConfig {
  return { ...mutator(config), updatedAt: nowIso(now) };
}

export function replaceConfig(
  configs: ReadonlyArray<ItemConfig>,
  next: ItemConfig,
): ReadonlyArray<ItemConfig> {
  return configs.map((c) => (c.id === next.id ? next : c));
}

// ── Config-level operations ─────────────────────────────────────────

export function createConfig(
  configs: ReadonlyArray<ItemConfig>,
  args: { name: string; id: string },
  now: number,
): MutationResult {
  const id = slugify(args.id);
  if (!ID_RE.test(id)) return { ok: false, error: { kind: "invalid-id" } };
  if (configs.some((c) => c.id === id))
    return { ok: false, error: { kind: "duplicate-config-id", id } };
  const created: ItemConfig = {
    id,
    name: args.name.trim(),
    items: [],
    updatedAt: nowIso(now),
  };
  return { ok: true, configs: [created, ...configs], result: created };
}

export function duplicateConfig(
  configs: ReadonlyArray<ItemConfig>,
  sourceId: string,
  args: { name: string; id: string },
  now: number,
): MutationResult {
  const source = configs.find((c) => c.id === sourceId);
  if (!source) return { ok: false, error: { kind: "not-found" } };
  const id = slugify(args.id);
  if (!ID_RE.test(id)) return { ok: false, error: { kind: "invalid-id" } };
  if (configs.some((c) => c.id === id))
    return { ok: false, error: { kind: "duplicate-config-id", id } };
  // Deep-copy items so future edits to the copy don't touch the source.
  // Arrays are typed readonly but we still want fresh refs.
  const copied: ItemConfig = {
    id,
    name: args.name.trim(),
    items: source.items.map((i) => ({ ...i })),
    updatedAt: nowIso(now),
  };
  return { ok: true, configs: [copied, ...configs], result: copied };
}

export function deleteConfig(
  configs: ReadonlyArray<ItemConfig>,
  id: string,
): MutationResult<{ id: string }> {
  if (!configs.some((c) => c.id === id))
    return { ok: false, error: { kind: "not-found" } };
  return { ok: true, configs: configs.filter((c) => c.id !== id), result: { id } };
}
