/**
 * Three-segment window selector (24h / 7d / 30d) for the transactions
 * stream. The mapped IDs feed `useTransactionsStream` directly.
 */

import type { StreamWindow } from "@features/reports/transaction-stream.ts";
import { SegmentedChips } from "./SegmentedChips.tsx";

export interface PeriodPickerProps {
  readonly value: StreamWindow;
  readonly onChange: (next: StreamWindow) => void;
}

const ITEMS = [
  { id: "24h" as const, label: "Last 24h" },
  { id: "7d" as const, label: "Last 7d" },
  { id: "30d" as const, label: "Last 30d" },
];

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  return (
    <SegmentedChips
      value={value}
      onChange={onChange}
      items={ITEMS}
      eyebrow="Period"
    />
  );
}
