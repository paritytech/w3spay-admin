// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { MerchantProfile } from "@/shared/lib/config-qr";

/**
 * A restaurant is the user-facing label for an on-chain `MerchantProfile`
 * (a group-level merchant identity), keyed by `id == groupId`. The profile's
 * display fields (name, address, phone, tax id) ride inline into each T3rminal
 * QR; `merchantId` is the separate merchant code embedded in a published
 * payment-processor config's `profile` (e.g. group `funkhaus-zola` →
 * merchantName `Zola`, merchantId `funkhaus`).
 *
 * Source of truth is the registry contract (`getAllMerchantProfileIds` +
 * `getMerchantProfile`) — see `contracts/restaurant-queries.ts`. There is no
 * local KV: every admin device converges on what's published on-chain.
 */
export interface Restaurant {
  readonly id: string;
  /** Merchant code (e.g. "funkhaus") — distinct from `id`/groupId (e.g. "funkhaus-zola"). */
  readonly merchantId: string;
  readonly profile: MerchantProfile;
}

export interface RestaurantForm {
  readonly id: string;
  readonly name: string;
  readonly merchantId: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phone: string;
  readonly taxId: string;
}

export const EMPTY_RESTAURANT_FORM: RestaurantForm = {
  id: "",
  name: "",
  merchantId: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  taxId: "",
};

export function restaurantToForm(restaurant: Restaurant | null | undefined): RestaurantForm {
  if (!restaurant) return EMPTY_RESTAURANT_FORM;
  const p = restaurant.profile;
  return {
    id: restaurant.id,
    name: p.name,
    merchantId: restaurant.merchantId,
    addressLine1: p.addressLine1 ?? "",
    addressLine2: p.addressLine2 ?? "",
    phone: p.phone ?? "",
    taxId: p.taxId ?? "",
  };
}

/**
 * Build a `Restaurant` from form input, or `null` when a required field
 * (`id`, `name`, `merchantId`) is blank. Optional profile fields are omitted
 * when empty so the encoded payload stays minimal.
 */
export function formToRestaurant(form: RestaurantForm): Restaurant | null {
  const id = form.id.trim();
  const name = form.name.trim();
  const merchantId = form.merchantId.trim();
  if (id.length === 0 || name.length === 0 || merchantId.length === 0) return null;
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
  return { id, merchantId, profile };
}

export interface UseRestaurantsResult {
  readonly restaurants: ReadonlyMap<string, Restaurant>;
  /** False while the first registry read is in flight. */
  readonly hydrated: boolean;
  getRestaurant(id: string): Restaurant | null;
}

let pendingPickedRestaurant: { merchantKey: string; restaurantId: string } | null = null;

export const restaurantPickerHint = {
  set(merchantKey: string, restaurantId: string): void {
    pendingPickedRestaurant = { merchantKey, restaurantId };
  },
  consume(merchantKey: string): string | null {
    if (pendingPickedRestaurant == null) return null;
    if (pendingPickedRestaurant.merchantKey !== merchantKey) return null;
    const id = pendingPickedRestaurant.restaurantId;
    pendingPickedRestaurant = null;
    return id;
  },
  clear(): void {
    pendingPickedRestaurant = null;
  },
};
