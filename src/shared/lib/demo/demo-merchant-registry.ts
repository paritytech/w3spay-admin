/**
 * In-memory demo merchant registry — the single source of truth for the
 * merchant registry in demo mode.
 *
 * The merchant-registry query reads these rows (its demo branch) and the
 * merchant write mutations mutate them via the pure `demo-actions`
 * reducers, then invalidate the query so the read re-runs and reflects
 * the change. Replaces the former `useDemoMerchantStore` React-state
 * registry; module-level so the query (non-React) and the mutations
 * share one list.
 *
 * Ephemeral by design (resets on reload). Seeded from
 * `DEMO_MERCHANT_SEED`.
 */

import { DEMO_MERCHANT_SEED } from "./demo-merchants.ts";
import type { RegistryMerchantRow } from "@features/merchant/merchant-model.ts";

let rows: ReadonlyArray<RegistryMerchantRow> = DEMO_MERCHANT_SEED;

export function getDemoMerchantRows(): ReadonlyArray<RegistryMerchantRow> {
  return rows;
}

export function setDemoMerchantRows(next: ReadonlyArray<RegistryMerchantRow>): void {
  rows = next;
}

/** Test/HMR only — restore the seed. */
export function resetDemoMerchantRows(): void {
  rows = DEMO_MERCHANT_SEED;
}
