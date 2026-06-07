/**
 * Balances tab — registered, non-revoked payout destinations.
 *
 * The registry stores identity, lifecycle, and destination. It does NOT
 * store payment totals or rates, so this view does not invent any. When
 * a payment-aggregate source is wired in, totals can be layered on top
 * without changing the underlying list.
 *
 * Reads merchants from `useMerchants()`. Sort state is local.
 * Row taps go through `useRouter().navigate` to the merchant detail.
 */

import { useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useNavigate } from "@tanstack/react-router";
import { useConfig } from "@shared/config";
import { useTokenBalances } from "@features/balances/contracts/balance-queries.ts";
import { AHead, type Density } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { BalanceRow } from "@features/balances/components/BalanceRow.tsx";
import { sortByBalance, type BalanceSort } from "@features/balances/components/sort.ts";
import { SortMenu } from "@features/balances/components/SortMenu.tsx";
import { SummaryCard } from "@features/balances/components/SummaryCard.tsx";

export type { BalanceSort } from "@features/balances/components/sort.ts";

export interface BalancesProps {
  density?: Density;
}

export function Balances({ density = "comfortable" }: BalancesProps) {
  const { merchants } = useMerchants();
  const navigate = useNavigate();

  const [sort, setSort] = useState<BalanceSort>("recent");

  const tokenSymbol = useConfig().token.symbol;
  const visible = merchants.filter((m) => m.status !== "revoked");
  const visibleAddresses = visible.map((m) => m.destinationAccountId);
  const { balances, state: balanceState, error: balanceError, refresh } = useTokenBalances(visibleAddresses);

  const sorted = [...visible].sort(sortByBalance(sort, balances));

  const totalMerchants = merchants.length;
  const activeMerchants = merchants.filter((m) => m.status === "active").length;
  const pausedMerchants = merchants.filter((m) => m.status === "paused").length;
  const revokedMerchants = merchants.filter((m) => m.status === "revoked").length;
  const totalBalance = visible.reduce(
    (acc, m) => acc + (balances.get(m.destinationAccountId) ?? 0n),
    0n,
  );

  const refreshing = balanceState === "loading";

  return (
    <>
      <AHead eyebrow="Treasury" title="Balances" size={32} />

      <SummaryCard
        tokenSymbol={tokenSymbol}
        totalMerchants={totalMerchants}
        activeMerchants={activeMerchants}
        pausedMerchants={pausedMerchants}
        revokedMerchants={revokedMerchants}
        totalBalance={totalBalance}
        refreshing={refreshing}
        balanceError={balanceError}
        onRefresh={() => { void refresh(); }}
      />

      <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => { void refresh(); }}
          disabled={refreshing}
          title="Refresh balances"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: `1px solid ${COLOR.border}`,
            borderRadius: 8,
            width: 30,
            height: 30,
            cursor: refreshing ? "default" : "pointer",
            color: refreshing ? COLOR.muted : COLOR.text3,
            flexShrink: 0,
            transition: "color .15s, border-color .15s",
          }}
          onMouseEnter={(e) => {
            if (!refreshing) {
              e.currentTarget.style.color = COLOR.text;
              e.currentTarget.style.borderColor = COLOR.border2;
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = refreshing ? COLOR.muted : COLOR.text3;
            e.currentTarget.style.borderColor = COLOR.border;
          }}
        >
          <Icon
            name="refresh-cw"
            size={13}
            color="currentColor"
            strokeWidth={2}
          />
        </button>
        <SortMenu value={sort} onChange={setSort} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: density === "compact" ? 4 : 6 }}>
        {sorted.map((m, i) => (
          <BalanceRow
            key={m.key}
            m={m}
            density={density}
            rank={i + 1}
            balance={balances.get(m.destinationAccountId)}
            balanceLoading={refreshing && !balances.has(m.destinationAccountId)}
            onClick={() => navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } })}
          />
        ))}
        {sorted.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: COLOR.muted, fontSize: 13 }}>
            No active or paused terminals.
          </div>
        ) : null}
      </div>
    </>
  );
}
