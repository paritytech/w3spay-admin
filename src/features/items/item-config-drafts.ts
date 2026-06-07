/**
 * Local draft + published-snapshot layer for item configs.
 *
 * The admin app keeps three views of each item config:
 *
 *   1. **Drafts** — what the operator is currently editing. Stored
 *      locally (host KV or `localStorage`) so a page reload doesn't wipe
 *      in-progress menu work. Drafts dictate what the Items tab renders.
 *   2. **Published snapshots** — the last envelope on Bulletin Chain,
 *      keyed by config id. The Items tab compares each draft against its
 *      snapshot to compute "dirty" state and gate the Publish-all action.
 *   3. **Synced base** — the published body each draft was last
 *      reconciled against. This common ancestor lets
 *      `reconcilePublishedConfigs` tell a genuine local edit (keep) apart
 *      from a stale copy another device has since republished (adopt), so
 *      every admin device converges on the published menu without ever
 *      clobbering in-progress edits.
 *
 * This module owns the local persistence, the dirty diff, and the
 * cross-device reconcile. Bulletin-side decoding lives in
 * `bulletin/envelope.ts`; contract reads live in `item-configs-read.ts`.
 * We do not encrypt anything — published item configs are public.
 */

import { normalizeLegacyItemConfigShape, type ItemConfig } from "./items-model.ts";

/** Stable storage key under the admin app's `KvStore` prefix. */
export const ITEM_CONFIG_DRAFTS_KEY = "item-config-drafts/v1";

/**
 * Versioned payload persisted under `ITEM_CONFIG_DRAFTS_KEY`.
 *
 * v2 adds `base`: the published body each config was last reconciled
 * against (see the module header). A v1 payload (no `base`) migrates by
 * treating the persisted drafts as their own baseline — see
 * `decodeDraftsPayload`.
 */
export interface ItemConfigDraftsPayloadV1 {
  readonly version: 1;
  readonly configs: ReadonlyArray<ItemConfig>;
}

export interface ItemConfigDraftsPayloadV2 {
  readonly version: 2;
  readonly configs: ReadonlyArray<ItemConfig>;
  readonly base: ReadonlyArray<ItemConfig>;
}

/** Result of decoding a stored payload: the editable drafts plus the
 *  reconcile baseline (rebuilt into an id-keyed map by the store). */
export interface DecodedDrafts {
  readonly configs: ReadonlyArray<ItemConfig>;
  readonly base: ReadonlyArray<ItemConfig>;
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
 * Encode a draft payload for `KvStore.setJSON`. Persists both the
 * editable `configs` and the reconcile `base` so the cross-device merge
 * survives reloads.
 */
export function encodeDraftsPayload(
  configs: ReadonlyArray<ItemConfig>,
  base: ReadonlyArray<ItemConfig>,
): ItemConfigDraftsPayloadV2 {
  return { version: 2, configs, base };
}

/**
 * Decode a payload retrieved from `KvStore.getJSON`. Returns `null`
 * when the payload is missing or malformed — callers fall back to a
 * seed list in that case.
 *
 * Accepts both schema versions and legacy category-shaped configs
 * (flattened via `normalizeLegacyItemConfigShape`). A v1 payload has no
 * reconcile baseline, so its drafts become their own base: the device
 * then treats the chain as authoritative on first reconcile (it cannot
 * know which drafts were unpublished edits) and protects every edit made
 * afterwards.
 */
export function decodeDraftsPayload(raw: unknown): DecodedDrafts | null {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as { version?: unknown; configs?: unknown; base?: unknown };
  if (obj.version !== 1 && obj.version !== 2) return null;
  if (!Array.isArray(obj.configs)) return null;
  const configs = normalizeConfigList(obj.configs);
  // v1: no baseline → drafts are their own base. v2: decode the stored base.
  const base =
    obj.version === 2 && Array.isArray(obj.base) ? normalizeConfigList(obj.base) : configs;
  return { configs, base };
}

function normalizeConfigList(raw: ReadonlyArray<unknown>): ReadonlyArray<ItemConfig> {
  const out: ItemConfig[] = [];
  for (const candidate of raw) {
    const normalized = normalizeLegacyItemConfigShape(candidate);
    if (normalized) out.push(normalized);
  }
  return out;
}

/** Convenience: read drafts (configs only), fall back to `fallback` on
 *  any decode failure. */
export function decodeDraftsOrFallback(
  raw: unknown,
  fallback: ReadonlyArray<ItemConfig>,
): ReadonlyArray<ItemConfig> {
  const decoded = decodeDraftsPayload(raw);
  if (decoded === null) return fallback;
  return decoded.configs;
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

/** True when two config bodies are content-equal — the same notion of
 *  equality the dirty diff uses (order-sensitive items, `updatedAt`
 *  ignored). Lets the reconcile detect "no local edits since base". */
export function sameConfigContent(a: ItemConfig, b: ItemConfig): boolean {
  return !isConfigDirty(a, b);
}

/** Result of a cross-device reconcile: the next draft list plus the
 *  baseline each draft is now reconciled against (keyed by config id). */
export interface ReconciledDrafts {
  readonly configs: ReadonlyArray<ItemConfig>;
  readonly base: ReadonlyMap<string, ItemConfig>;
}

/**
 * Merge the published registry into the local drafts so every admin
 * device converges on the published menu without losing in-progress
 * edits. A three-way merge keyed by config id, using `base` (the body
 * each draft was last reconciled against) as the common ancestor:
 *
 *   - draft already equals the chain → pin the baseline to it (covers
 *     the just-published state).
 *   - draft equals its base (no local edits) → adopt the chain's body,
 *     picking up another device's change.
 *   - draft differs from both base and chain → genuine local edit; keep
 *     it (the dirty diff surfaces it for publishing).
 *   - config on chain but not local → adopt when never seen here; keep
 *     it deleted (don't resurrect) when a baseline tombstone exists.
 *
 * Returns `null` when nothing changes — including when the registry has
 * no resolved bodies yet (keep the current drafts).
 */
export function reconcilePublishedConfigs(
  drafts: ReadonlyArray<ItemConfig>,
  base: ReadonlyMap<string, ItemConfig>,
  snapshots: ReadonlyMap<string, PublishedConfigSnapshot>,
): ReconciledDrafts | null {
  // Resolved published bodies, in registry order.
  const published = new Map<string, ItemConfig>();
  for (const snap of snapshots.values()) {
    if (snap.snapshot != null) published.set(snap.configId, snap.snapshot);
  }
  if (published.size === 0) return null;

  const nextConfigs: ItemConfig[] = [];
  const nextBase = new Map<string, ItemConfig>();
  const draftIds = new Set(drafts.map((d) => d.id));
  let changed = false;

  for (const draft of drafts) {
    const chain = published.get(draft.id);
    const ancestor = base.get(draft.id);
    if (chain === undefined) {
      // Local-only config (created here, not yet published) or its body
      // hasn't resolved — keep the draft, carry its baseline forward.
      nextConfigs.push(draft);
      if (ancestor !== undefined) nextBase.set(draft.id, ancestor);
    } else if (sameConfigContent(draft, chain)) {
      // Already in sync with the chain (e.g. right after publishing).
      nextConfigs.push(draft);
      nextBase.set(draft.id, chain);
    } else if (ancestor === undefined || sameConfigContent(draft, ancestor)) {
      // No local edits since the baseline (or none recorded) → adopt the
      // peer's published body.
      nextConfigs.push(chain);
      nextBase.set(draft.id, chain);
      changed = true;
    } else {
      // Genuine pending local edit → keep it; leave the ancestor intact.
      nextConfigs.push(draft);
      nextBase.set(draft.id, ancestor);
    }
  }

  for (const [configId, chain] of published) {
    if (draftIds.has(configId)) continue;
    const tombstone = base.get(configId);
    if (tombstone !== undefined) {
      // Deleted locally after a prior sync — keep the tombstone so the
      // next poll doesn't resurrect it.
      nextBase.set(configId, tombstone);
    } else {
      // Brand-new config published by another device.
      nextConfigs.push(chain);
      nextBase.set(configId, chain);
      changed = true;
    }
  }

  if (!changed && baseMapsEqual(nextBase, base)) return null;
  return { configs: changed ? nextConfigs : drafts, base: nextBase };
}

function baseMapsEqual(
  a: ReadonlyMap<string, ItemConfig>,
  b: ReadonlyMap<string, ItemConfig>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, body] of a) {
    const other = b.get(id);
    if (other === undefined || !sameConfigContent(body, other)) return false;
  }
  return true;
}
