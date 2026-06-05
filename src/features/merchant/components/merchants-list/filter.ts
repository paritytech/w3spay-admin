/**
 * Pure filter + sort over `AdminMerchant[]`, factored out of
 * `MerchantsList.tsx` so it's trivially testable in isolation and the
 * component body stays focused on layout.
 */

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { MerchantSort, StatusFilter } from "./types.ts";

export interface FilterSortArgs {
  readonly merchants: ReadonlyArray<AdminMerchant>;
  readonly search: string;
  readonly filter: StatusFilter;
  readonly sort: MerchantSort;
}

export function filterAndSortMerchants({
  merchants,
  search,
  filter,
  sort,
}: FilterSortArgs): ReadonlyArray<AdminMerchant> {
  const q = search.toLowerCase();
  const hasQuery = q.length > 0;
  return merchants
    .filter((m) => filter === "all" || m.status === filter)
    .filter((m) => {
      if (!hasQuery) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.terminalId.toLowerCase().includes(q) ||
        m.merchantId.toLowerCase().includes(q) ||
        m.destinationAccountId.toLowerCase().includes(q) ||
        m.destinationSs58.toLowerCase().includes(q) ||
        (m.derivedH160?.toLowerCase().includes(q) ?? false)
      );
    })
    .slice() // detach from caller's array before sorting
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      // recent → most recently updated first
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
