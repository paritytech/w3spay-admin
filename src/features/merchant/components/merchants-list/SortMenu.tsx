/**
 * Sort dropdown for the merchants directory. The select is styled to
 * match the chip row visually (rounded pill, chevron icon as background
 * image so we don't depend on the platform's native arrow).
 */

import { COLOR } from "@shared/components/tokens.ts";
import type { MerchantSort } from "./types.ts";

const SORT_LABELS: Record<MerchantSort, string> = {
  recent: "Recently updated",
  name: "Name",
};

const CHEVRON_BG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")";

export interface SortMenuProps {
  value: MerchantSort;
  onChange: (v: MerchantSort) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MerchantSort)}
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
      {(Object.entries(SORT_LABELS) as Array<[MerchantSort, string]>).map(([v, l]) => (
        <option key={v} value={v}>
          Sort · {l}
        </option>
      ))}
    </select>
  );
}
