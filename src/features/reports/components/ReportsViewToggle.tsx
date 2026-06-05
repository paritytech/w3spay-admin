/**
 * Two-segment "Transactions vs Daily reports" toggle shown at the top
 * of both the Reports tab and per-terminal drill-in. Defaults to the
 * Transactions view; the parent owns the state.
 */

import { SegmentedChips } from "./SegmentedChips.tsx";

export type ReportsViewId = "transactions" | "days";

export interface ReportsViewToggleProps {
  readonly value: ReportsViewId;
  readonly onChange: (next: ReportsViewId) => void;
}

const ITEMS = [
  { id: "transactions" as const, label: "Transactions" },
  { id: "days" as const, label: "Daily reports" },
];

export function ReportsViewToggle({ value, onChange }: ReportsViewToggleProps) {
  return <SegmentedChips value={value} onChange={onChange} items={ITEMS} />;
}
