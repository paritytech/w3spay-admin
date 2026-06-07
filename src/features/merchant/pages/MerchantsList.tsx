/**
 * Merchants tab — directory list with search, status filter, and sort.
 *
 * Reads merchants from `useMerchants()`. Navigation on row tap
 * goes through `useRouter().navigate`. Search / filter / sort state is
 * local to this component (resets when the user navigates away — same
 * behavior as before).
 *
 * Sub-components live in `./merchants-list/`; the filter + sort logic
 * is extracted to `./merchants-list/filter.ts` for direct testing.
 */

import { useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useCanWriteMerchants } from "@features/merchant/contracts/use-merchant-write-ops.ts";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@shared/components/Icon.tsx";
import { AHead, APrimary, type Density } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { Chip } from "@features/merchant/components/merchants-list/Chip.tsx";
import { Counter } from "@features/merchant/components/merchants-list/Counter.tsx";
import { filterAndSortMerchants } from "@features/merchant/components/merchants-list/filter.ts";
import { MerchantRow } from "@features/merchant/components/merchants-list/MerchantRow.tsx";
import { SortMenu } from "@features/merchant/components/merchants-list/SortMenu.tsx";
import type { MerchantSort, StatusFilter } from "@features/merchant/components/merchants-list/types.ts";

export type { MerchantSort, StatusFilter } from "@features/merchant/components/merchants-list/types.ts";

export interface MerchantsListProps {
  density?: Density;
}

export function MerchantsList({ density = "comfortable" }: MerchantsListProps) {
  const { merchants } = useMerchants();
  const navigate = useNavigate();
  const canWrite = useCanWriteMerchants();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<MerchantSort>("recent");

  const filtered = filterAndSortMerchants({ merchants, search, filter, sort });

  const total = merchants.length;
  const active = merchants.filter((m) => m.status === "active").length;
  const paused = merchants.filter((m) => m.status === "paused").length;
  const revoked = merchants.filter((m) => m.status === "revoked").length;

  return (
    <>
      <AHead eyebrow="Directory" title="Merchants" size={32} />

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <Counter label="Total" value={total} />
        <Counter label="Active" value={active} dot={COLOR.green} />
        <Counter label="Paused" value={paused} dot={COLOR.amber} />
        <Counter label="Revoked" value={revoked} dot={COLOR.red} />
      </div>

      <div style={{ position: "relative", marginBottom: 10 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, terminal, merchant ID, destination…"
          style={{
            background: COLOR.surface,
            color: COLOR.text,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 999,
            padding: "10px 14px 10px 36px",
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        <span style={{ position: "absolute", left: 13, top: 11, color: COLOR.muted }}>
          <Icon name="scan" size={14} />
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["paused", "Paused"],
            ["revoked", "Revoked"],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
            {label}
          </Chip>
        ))}
        <div style={{ flex: 1 }} />
        <SortMenu value={sort} onChange={setSort} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: COLOR.muted, fontSize: 13 }}>
          <div
            style={{
              fontFamily: FONT.serif,
              fontStyle: "italic",
              fontSize: 18,
              color: COLOR.text3,
              marginBottom: 6,
            }}
          >
            Nothing matches.
          </div>
          <div>Try a different search or filter.</div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: density === "compact" ? 6 : 8 }}>
        {filtered.map((m) => (
          <MerchantRow
            key={m.key}
            m={m}
            density={density}
            onClick={() => navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } })}
          />
        ))}
      </div>

      <div style={{ height: 14 }} />
      <APrimary onClick={() => navigate({ to: "/merchants/new" })} disabled={!canWrite}>
        <Icon name="plus" size={14} /> Register terminal
      </APrimary>
    </>
  );
}
