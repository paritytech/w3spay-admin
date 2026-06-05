/**
 * Status filter chip group — All / Finished / Refunded. Pure UI; the
 * matching predicate lives in `TransactionsView` so the filter logic
 * stays alongside the visible pagination state.
 */

import { SegmentedChips } from "./SegmentedChips.tsx";

export type StatusFilterId = "all" | "finished" | "refunded";

export interface StatusFilterProps {
  readonly value: StatusFilterId;
  readonly onChange: (next: StatusFilterId) => void;
}

const ITEMS = [
  { id: "all" as const, label: "All" },
  { id: "finished" as const, label: "Finished" },
  { id: "refunded" as const, label: "Refunded" },
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <SegmentedChips
      value={value}
      onChange={onChange}
      items={ITEMS}
      eyebrow="Status"
    />
  );
}
