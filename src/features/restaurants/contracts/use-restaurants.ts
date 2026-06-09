// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

import {
  formToRestaurant,
  type Restaurant,
  type RestaurantForm,
  type UseRestaurantsResult,
} from "../restaurants.ts";
import {
  getDemoRestaurants,
  restaurantRegistryQueryOptions,
  setDemoRestaurants,
} from "./restaurant-queries.ts";
import {
  removeMerchantProfile,
  upsertMerchantProfile,
} from "./merchant-profile-writes.ts";

const EMPTY = new Map<string, Restaurant>();

/**
 * Read-only restaurant directory, sourced from the registry contract (or the
 * in-memory demo store in demo mode). Polls via the shared query options.
 */
export function useRestaurants(): UseRestaurantsResult {
  const query = useQuery(restaurantRegistryQueryOptions());
  const restaurants = useMemo(() => {
    const data = query.data;
    if (data == null || data.length === 0) return EMPTY;
    const map = new Map<string, Restaurant>();
    for (const r of data) map.set(r.id, r);
    return map;
  }, [query.data]);

  return {
    restaurants,
    hydrated: !query.isLoading,
    getRestaurant: (id) => restaurants.get(id) ?? null,
  };
}

export interface RestaurantWrites {
  upsert(form: RestaurantForm, onStatus?: (status: TxStatus) => void): Promise<void>;
  remove(id: string, onStatus?: (status: TxStatus) => void): Promise<void>;
}

async function invalidateRestaurants(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryRoots.restaurantRegistry });
}

/** Drive the full `TxStatus` lifecycle on a microtask so demo writes emit the same sequence a real chain watcher would. */
function emitDemoLifecycle(onStatus?: (status: TxStatus) => void): Promise<void> {
  if (onStatus == null) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  queueMicrotask(() => {
    onStatus("preparing");
    onStatus("signing");
    onStatus("broadcasting");
    onStatus("in-block");
    onStatus("finalized");
    resolve();
  });
  return promise;
}

/**
 * Write actions for the restaurant (on-chain `MerchantProfile`) directory, or
 * `null` in real mode when no account is ready. Demo mode always returns
 * actions backed by the in-memory demo store. Mirrors `useMerchantActions`.
 */
export function useRestaurantWrites(account: ReadyAdminAccount | null): RestaurantWrites | null {
  return useMemo<RestaurantWrites | null>(() => {
    if (isDemoMode()) {
      return {
        upsert: async (form, onStatus) => {
          const restaurant = formToRestaurant(form);
          if (restaurant == null) throw new Error("Restaurant id, name and merchant id are required.");
          await emitDemoLifecycle(onStatus);
          const next = getDemoRestaurants().filter((r) => r.id !== restaurant.id);
          setDemoRestaurants([...next, restaurant]);
          await invalidateRestaurants();
        },
        remove: async (id, onStatus) => {
          await emitDemoLifecycle(onStatus);
          setDemoRestaurants(getDemoRestaurants().filter((r) => r.id !== id));
          await invalidateRestaurants();
        },
      };
    }
    if (account == null) return null;
    const context = { signer: account.signer, walletAddress: account.ss58Address };
    return {
      upsert: async (form, onStatus) => {
        const restaurant = formToRestaurant(form);
        if (restaurant == null) throw new Error("Restaurant id, name and merchant id are required.");
        await upsertMerchantProfile({
          context,
          payload: {
            groupId: restaurant.id,
            merchantName: restaurant.profile.name,
            merchantId: restaurant.merchantId,
            addressLine1: restaurant.profile.addressLine1 ?? "",
            addressLine2: restaurant.profile.addressLine2 ?? "",
            phone: restaurant.profile.phone ?? "",
            taxId: restaurant.profile.taxId ?? "",
          },
          onStatus,
        });
        await invalidateRestaurants();
      },
      remove: async (id, onStatus) => {
        await removeMerchantProfile({ context, payload: { groupId: id }, onStatus });
        await invalidateRestaurants();
      },
    };
  }, [account]);
}
