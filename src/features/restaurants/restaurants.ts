/**
 * Local-only restaurant records, keyed by a slug `id`.
 *
 * A restaurant captures the legal name + physical-address fields that a
 * receipt header carries (and that the v2 QR's optional `profile`
 * sub-map embeds inline). Restaurants are independent first-class
 * entities — multiple T3rminals can point at the same restaurant by
 * referencing its `id`, and a T3rminal's on-chain `merchantId` is no
 * longer the implicit primary key.
 *
 * Storage: `KvStore.getJSON(RESTAURANTS_KEY)` under the admin app's KV
 * prefix. On first hydrate, if the new key is empty, we migrate any
 * legacy entries written under the old `merchant-profiles/v1` key (the
 * pre-rename behaviour) into the new shape using their `merchantId` as
 * the new `id`. Mirrors `t3rminal-assignments.ts` and
 * `item-config-drafts.ts`.
 *
 * The wire type {@link MerchantProfile} comes from the shared codec so
 * the producer and (future) consumer agree on a single shape — the
 * `Restaurant.id` is admin-side bookkeeping and never crosses the wire.
 */

import type { MerchantProfile } from "@/shared/config-qr";

/** Stable storage key under the admin app's KV prefix. */
export const RESTAURANTS_KEY = "restaurants/v1" as const;

/**
 * Legacy storage key — entries were keyed by terminal `merchantId`.
 * Read once at hydrate time and remapped into {@link Restaurant}s if
 * the new key is empty; never written.
 */
export const LEGACY_MERCHANT_PROFILES_KEY = "merchant-profiles/v1" as const;

/**
 * A restaurant captured locally on the admin device. `id` is a
 * slug-style identifier the operator picks at creation (e.g.
 * `funkhaus-berlin`); `profile` is the wire-shape payload that gets
 * embedded in the QR.
 */
export interface Restaurant {
  readonly id: string;
  readonly profile: MerchantProfile;
}

export interface RestaurantsPayloadV1 {
  readonly version: 1;
  /** Keyed by `id`. */
  readonly restaurants: Record<string, MerchantProfile>;
}

/**
 * All-string, all-present mirror of {@link Restaurant} for controlled
 * form inputs. Optional wire fields surface as `""` here so the inputs
 * stay controlled; {@link formToRestaurant} trims them back to an
 * omittable wire profile.
 */
export interface RestaurantForm {
  readonly id: string;
  readonly name: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phone: string;
  readonly taxId: string;
}

export const EMPTY_RESTAURANT_FORM: RestaurantForm = {
  id: "",
  name: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  taxId: "",
};

/** Hydrate a form from a stored restaurant (or the empty form if absent). */
export function restaurantToForm(restaurant: Restaurant | null | undefined): RestaurantForm {
  if (!restaurant) return EMPTY_RESTAURANT_FORM;
  const p = restaurant.profile;
  return {
    id: restaurant.id,
    name: p.name,
    addressLine1: p.addressLine1 ?? "",
    addressLine2: p.addressLine2 ?? "",
    phone: p.phone ?? "",
    taxId: p.taxId ?? "",
  };
}

/**
 * Trim a form into a wire-ready {@link Restaurant}. Blank optional
 * fields are dropped (so they never bloat the QR). Returns `null` if
 * the form is unsubmittable (blank `id` or blank `name`); the caller
 * is responsible for surfacing that as a validation error.
 */
export function formToRestaurant(form: RestaurantForm): Restaurant | null {
  const id = form.id.trim();
  const name = form.name.trim();
  if (id.length === 0 || name.length === 0) return null;
  const profile: {
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    taxId?: string;
  } = { name };
  const addressLine1 = form.addressLine1.trim();
  if (addressLine1.length > 0) profile.addressLine1 = addressLine1;
  const addressLine2 = form.addressLine2.trim();
  if (addressLine2.length > 0) profile.addressLine2 = addressLine2;
  const phone = form.phone.trim();
  if (phone.length > 0) profile.phone = phone;
  const taxId = form.taxId.trim();
  if (taxId.length > 0) profile.taxId = taxId;
  return { id, profile };
}

export function encodeRestaurantsPayload(
  restaurants: ReadonlyMap<string, Restaurant>,
): RestaurantsPayloadV1 {
  const out: Record<string, MerchantProfile> = {};
  for (const [id, r] of restaurants) out[id] = r.profile;
  return { version: 1, restaurants: out };
}

/**
 * Defensively decode a stored payload. Returns an empty map on any
 * shape mismatch (no throw) so a corrupted KV entry doesn't lock the
 * UI in a broken state — operators just re-enter the restaurant.
 */
export function decodeRestaurantsPayload(raw: unknown): Map<string, Restaurant> {
  if (raw == null || typeof raw !== "object") return new Map();
  const obj = raw as { version?: unknown; restaurants?: unknown };
  if (obj.version !== 1 || obj.restaurants == null || typeof obj.restaurants !== "object") {
    return new Map();
  }
  return profilesRecordToRestaurants(obj.restaurants as Record<string, unknown>);
}

/**
 * Decode the legacy `merchant-profiles/v1` payload shape (a flat
 * `Record<merchantId, MerchantProfile>` under a `profiles` key) into
 * the new {@link Restaurant} map, using each entry's storage key as
 * the new `id`. Used once at hydrate time when the new key is empty
 * to preserve existing local data after the rename. Returns an empty
 * map on any shape mismatch.
 */
export function decodeLegacyMerchantProfilesPayload(raw: unknown): Map<string, Restaurant> {
  if (raw == null || typeof raw !== "object") return new Map();
  const obj = raw as { version?: unknown; profiles?: unknown };
  if (obj.version !== 1 || obj.profiles == null || typeof obj.profiles !== "object") {
    return new Map();
  }
  return profilesRecordToRestaurants(obj.profiles as Record<string, unknown>);
}

function profilesRecordToRestaurants(
  profiles: Record<string, unknown>,
): Map<string, Restaurant> {
  const out = new Map<string, Restaurant>();
  for (const [id, value] of Object.entries(profiles)) {
    if (id.length === 0) continue;
    const profile = decodeMerchantProfile(value);
    if (profile) out.set(id, { id, profile });
  }
  return out;
}

function decodeMerchantProfile(value: unknown): MerchantProfile | null {
  if (value == null || typeof value !== "object") return null;
  const r = value as Partial<MerchantProfile>;
  if (typeof r.name !== "string" || r.name.length === 0) return null;
  const out: {
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    taxId?: string;
  } = { name: r.name };
  if (typeof r.addressLine1 === "string") out.addressLine1 = r.addressLine1;
  if (typeof r.addressLine2 === "string") out.addressLine2 = r.addressLine2;
  if (typeof r.phone === "string") out.phone = r.phone;
  if (typeof r.taxId === "string") out.taxId = r.taxId;
  return out;
}

export interface UseRestaurantsResult {
  readonly restaurants: ReadonlyMap<string, Restaurant>;
  readonly hydrated: boolean;
  /** Latest stored restaurant for `id`, or `null` when none. */
  getRestaurant(id: string): Restaurant | null;
  /**
   * Upsert a restaurant. The record is keyed by `restaurant.id`, so
   * passing a different id behaves as a "create" call.
   */
  upsertRestaurant(restaurant: Restaurant): void;
  /** Remove a restaurant by id. No-op when absent. */
  removeRestaurant(id: string): void;
}

/**
 * Transient single-shot cache for "the restaurant just created from
 * a Configure-T3rminal-anchored flow". Set by the new-restaurant
 * screen right before it navigates back to `merchants/configure-
 * t3rminal/<merchantKey>`; consumed once by `ConfigureT3rminal` on
 * mount so the picker can land on the freshly-created row without
 * leaning on the route discriminator (which would otherwise have to
 * tunnel a hint through the hash and immediately clear it).
 *
 * Module-level so this survives the navigate-then-mount window. Only
 * the (merchantKey, restaurantId) tuple is stored — `consume` is
 * keyed by merchantKey so a stale entry pointed at a different
 * terminal can't leak into the wrong configure screen.
 */
let pendingPickedRestaurant: { merchantKey: string; restaurantId: string } | null = null;

export const restaurantPickerHint = {
  /** Stage a pre-selection for the next configure-t3rminal mount. */
  set(merchantKey: string, restaurantId: string): void {
    pendingPickedRestaurant = { merchantKey, restaurantId };
  },
  /**
   * Claim the staged restaurant id for `merchantKey`, clearing the
   * cache so a subsequent mount sees nothing. Returns `null` when no
   * hint is staged or the hint targets a different terminal.
   */
  consume(merchantKey: string): string | null {
    if (pendingPickedRestaurant == null) return null;
    if (pendingPickedRestaurant.merchantKey !== merchantKey) return null;
    const id = pendingPickedRestaurant.restaurantId;
    pendingPickedRestaurant = null;
    return id;
  },
  /** Test helper — drop any staged hint without consuming it. */
  clear(): void {
    pendingPickedRestaurant = null;
  },
};
