/**
 * Local draft + published-snapshot layer for item configs.
 *
 * The admin app has two source-of-truth layers for item configs:
 *
 *   1. **Drafts** — what the operator is currently editing. Stored
 *      locally (host KV or `localStorage`) so a page reload doesn't wipe
 *      in-progress menu work. Drafts dictate what the Items tab renders.
 *   2. **Published snapshots** — the last envelope the admin uploaded to
 *      Bulletin Chain, keyed by config id. The Items tab compares each
 *      draft against its snapshot to compute "dirty" state and gate the
 *      Save/Publish-all action.
 *
 * This module owns the local persistence and the dirty diff. The
 * Bulletin-side decoding lives in `bulletin/envelope.ts`; the contract-
 * side reading lives in `contract/item-configs-read.ts`. We do not
 * encrypt anything — published item configs are intentionally public.
 */

import { normalizeLegacyItemConfigShape, type ItemConfig } from "./items-model.ts";

/** Stable storage key under the admin app's `KvStore` prefix. */
export const ITEM_CONFIG_DRAFTS_KEY = "item-config-drafts/v1";

/**
 * Versioned payload persisted under `ITEM_CONFIG_DRAFTS_KEY`. The
 * `version` field exists so a future schema migration can detect old
 * payloads without inferring it from the absence of a field.
 */
export interface ItemConfigDraftsPayloadV1 {
  readonly version: 1;
  readonly configs: ReadonlyArray<ItemConfig>;
}

/**
 * Snapshot of what each config looked like the last time it was
 * published to Bulletin Chain via the registry contract.
 *
 * `cid` is the on-chain identity; `size` and `updatedAt` mirror the
 * registry record so the Items tab can render publication metadata
 * without an extra round-trip. Bulletin Chain inclusion coordinates
 * are not tracked here — the host owns the chain account that signs
 * the preimage submission and would be responsible for any future
 * renewal.
 */
export interface PublishedConfigSnapshot {
  readonly configId: string;
  readonly cid: string;
  readonly size: number;
  readonly updatedAt: string;
  /**
   * The config body that produced `cid`. Recomputed locally after each
   * publish; absent until the operator publishes for the first time.
   */
  readonly snapshot: ItemConfig | null;
}

/**
 * Encode a draft payload for `KvStore.setJSON`. The KV store will
 * `JSON.stringify` for us, but going through this helper keeps the
 * `version` field consistent everywhere.
 */
export function encodeDraftsPayload(
  configs: ReadonlyArray<ItemConfig>,
): ItemConfigDraftsPayloadV1 {
  return { version: 1, configs };
}

/**
 * Decode a payload retrieved from `KvStore.getJSON`. Returns `null`
 * when the payload is missing, malformed, or from a future version —
 * callers should fall back to a seed list in that case.
 *
 * Accepts legacy category-shaped configs and flattens them in place
 * via `normalizeLegacyItemConfigShape`.
 */
export function decodeDraftsPayload(raw: unknown): ReadonlyArray<ItemConfig> | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as { version?: unknown; configs?: unknown };
  if (obj.version !== 1) return null;
  if (!Array.isArray(obj.configs)) return null;
  const out: ItemConfig[] = [];
  for (const candidate of obj.configs) {
    const normalized = normalizeLegacyItemConfigShape(candidate);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Convenience: read drafts, fall back to `fallback` on any decode failure. */
export function decodeDraftsOrFallback(
  raw: unknown,
  fallback: ReadonlyArray<ItemConfig>,
): ReadonlyArray<ItemConfig> {
  const decoded = decodeDraftsPayload(raw);
  if (decoded === null) return fallback;
  return decoded;
}

// ── Dirty diff ──────────────────────────────────────────────────────

/**
 * Compute whether `draft` differs from the previously-published
 * `snapshot`. Order-sensitive on the `items` array — terminals render
 * items in the order they're stored, so swapping two SKUs is a publish-
 * worthy change.
 *
 * Treats a missing snapshot as "dirty" — first publish always uploads.
 * The `updatedAt` field is ignored: the operator may bump it just by
 * opening the form, and we don't want a publish on every edit-then-
 * cancel cycle.
 */
export function isConfigDirty(
  draft: ItemConfig,
  snapshot: ItemConfig | null,
): boolean {
  if (snapshot === null) return true;
  if (draft.id !== snapshot.id) return true;
  if (draft.name.trim() !== snapshot.name.trim()) return true;
  if (draft.items.length !== snapshot.items.length) return true;
  for (let i = 0; i < draft.items.length; i += 1) {
    const a = draft.items[i];
    const b = snapshot.items[i];
    if (a === undefined || b === undefined) return true;
    if (a.id !== b.id || a.name !== b.name || a.price !== b.price) return true;
  }
  return false;
}

/** Find which configs in `drafts` are dirty against their snapshots. */
export function dirtyConfigIds(
  drafts: ReadonlyArray<ItemConfig>,
  snapshots: ReadonlyMap<string, PublishedConfigSnapshot>,
): ReadonlyArray<string> {
  const out: string[] = [];
  for (const draft of drafts) {
    const snap = snapshots.get(draft.id);
    if (isConfigDirty(draft, snap?.snapshot ?? null)) out.push(draft.id);
  }
  return out;
}
