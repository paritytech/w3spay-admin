// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions } from "@tanstack/react-query";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import { envConfig } from "@/config.ts";
import { listMerchantProfiles } from "./list-merchant-profiles.ts";
import type { MerchantProfileRecord } from "./merchant-profile-writes.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys } from "@shared/chain/keys.ts";
import type { Restaurant } from "../restaurants.ts";

// Poll the registry every 5s so each admin device converges on profiles
// another device has published.
const RESTAURANT_REGISTRY_POLL_MS = 5_000;

export function restaurantRegistryConfigured(): boolean {
  return envConfig.contracts.merchantRegistryAddress.trim() !== "";
}

/** Map an on-chain merchant-profile record to the user-facing `Restaurant`. */
export function recordToRestaurant(rec: MerchantProfileRecord): Restaurant {
  const profile: {
    name: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    taxId?: string;
  } = { name: rec.merchantName };
  if (rec.addressLine1.length > 0) profile.addressLine1 = rec.addressLine1;
  if (rec.addressLine2.length > 0) profile.addressLine2 = rec.addressLine2;
  if (rec.phone.length > 0) profile.phone = rec.phone;
  if (rec.taxId.length > 0) profile.taxId = rec.taxId;
  return { id: rec.groupId, merchantId: rec.merchantId, profile };
}

// In-memory demo registry: starts empty (no synthetic seed) and only holds
// what an in-session demo write put there, mirroring the merchant demo store.
let demoRestaurantState: Restaurant[] = [];

export function getDemoRestaurants(): ReadonlyArray<Restaurant> {
  return demoRestaurantState;
}

export function setDemoRestaurants(next: ReadonlyArray<Restaurant>): void {
  demoRestaurantState = [...next];
}

export function restaurantRegistryQueryOptions() {
  const registryAddress = envConfig.contracts.merchantRegistryAddress;
  return queryOptions({
    queryKey: queryKeys.restaurantRegistry(envConfig.chain.network, registryAddress),
    queryFn: (): Promise<ReadonlyArray<Restaurant>> =>
      isDemoMode()
        ? Promise.resolve(getDemoRestaurants())
        : withSpan("w3spay-admin:merchant-profile-registry.list", "chain.read", async () =>
            (await listMerchantProfiles(resolveRegistryAddress())).map(recordToRestaurant),),
    // A real empty address is surfaced as a config-error, not a failed fetch.
    enabled: isDemoMode() || restaurantRegistryConfigured(),
    refetchInterval: RESTAURANT_REGISTRY_POLL_MS,
  });
}
