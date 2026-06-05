/**
 * Sort dropdown for the Balances tab. Visually identical to the
 * MerchantsList SortMenu but with its own option set (balance / recent /
 * name / status).
 */

import { COLOR } from "@shared/components/tokens.ts";
import type { BalanceSort } from "./sort.ts";

const SORT_LABELS: Record<BalanceSort, string> = {
  balance: "Balance",
  recent: "Recently updated",
  name: "Name",
  status: "Status",
};

const CHEVRON_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")";

export interface SortMenuProps {
  value: BalanceSort;
  onChange: (v: BalanceSort) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as BalanceSort)}
      style={{
        background: "transparent",
        color: COLOR.text2,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        outline: "none",
        appearance: "none",
        WebkitAppearance: "none",
        paddingRight: 26,
        backgroundImage: CHEVRON_BG,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      {(Object.entries(SORT_LABELS) as Array<[BalanceSort, string]>).map(([v, l]) => (
        <option key={v} value={v}>
          Sort · {l}
        </option>
      ))}
    </select>
  );
}
