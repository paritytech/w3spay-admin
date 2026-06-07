/**
 * Merchant-registry read surface.
 *
 * Sources the registry read from the `merchant-registry` TanStack Query
 * (`useMerchantRegistry`) and maps the rows into the `AdminMerchant` UI
 * model. Demo mode is handled inside the query layer (in-memory bridge),
 * so there is no Real/Demo split here. Holds no state and needs no
 * provider — the registry query is shared by cache key across every
 * caller, so reads stay consistent even when several screens (plus the
 * gate + root chrome) call this at once.
 */

import { useMemo } from "react";

import {
  merchantFromRegistryRow,
  type AdminMerchant,
  type RegistryMerchantRow,
} from "@features/merchant/merchant-model.ts";
import { useMerchantRegistry, type MerchantRegistryReadState } from "./merchant-queries.ts";

const EMPTY_ROWS: ReadonlyArray<RegistryMerchantRow> = [];

export interface UseMerchantsResult {
  /** Read-only registry state machine (loading / config-error / error / ready). */
  readonly registry: MerchantRegistryReadState;
  readonly merchants: ReadonlyArray<AdminMerchant>;
  refreshMerchantEntries(): Promise<void>;
}

export function useMerchants(): UseMerchantsResult {
  const { state: registry, refresh: refreshMerchantEntries } = useMerchantRegistry();
  const rows = registry.kind === "ready" ? registry.rows : EMPTY_ROWS;
  const merchants = useMemo(() => rows.map(merchantFromRegistryRow), [rows]);
  return { registry, merchants, refreshMerchantEntries };
}
