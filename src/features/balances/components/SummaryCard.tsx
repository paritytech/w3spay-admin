/**
 * Treasury summary card at the top of the Balances tab. Shows registry
 * coverage (totals + per-status breakdown), the aggregate token balance
 * across visible (non-revoked) merchants, and a refresh button.
 */

import { formatTokenAmount } from "@features/balances/api/token-balance.ts";
import { ACard, ADotted, AEye, AMono } from "@shared/components/primitives.tsx";
import { Spinner } from "@shared/components/Spinner.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export interface SummaryCardProps {
  tokenSymbol: string;
  totalMerchants: number;
  activeMerchants: number;
  pausedMerchants: number;
  revokedMerchants: number;
  totalBalance: bigint;
  refreshing: boolean;
  balanceError: string | null;
  onRefresh: () => void;
}

export function SummaryCard({
  tokenSymbol,
  totalMerchants,
  activeMerchants,
  pausedMerchants,
  revokedMerchants,
  totalBalance,
  refreshing,
  balanceError,
  onRefresh,
}: SummaryCardProps) {
  return (
    <ACard
      padding={18}
      style={{ background: "linear-gradient(180deg, #1f1c1a 0%, #1c1917 100%)", marginBottom: 12 }}
    >
      <AEye>Registry coverage</AEye>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <AMono size={36} color={COLOR.text} weight={500}>
          {totalMerchants}
        </AMono>
        <span style={{ fontSize: 12, color: COLOR.muted, letterSpacing: "0.12em" }}>terminals</span>
      </div>
      <div style={{ fontSize: 13, color: COLOR.text3, marginTop: 4 }}>
        {activeMerchants} active · {pausedMerchants} paused · {revokedMerchants} revoked
      </div>
      <ADotted margin={14} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <AEye>Total {tokenSymbol} held</AEye>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            background: "transparent",
            color: COLOR.text3,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 999,
            padding: "4px 10px",
            fontFamily: "inherit",
            fontSize: 10.5,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: refreshing ? "default" : "pointer",
            opacity: refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Spinner size={11} color={COLOR.text3} />
              Refreshing…
            </span>
          ) : (
            "Refresh"
          )}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <AMono size={28} color={COLOR.text} weight={500}>
          {formatTokenAmount(totalBalance)}
        </AMono>
        <span style={{ fontSize: 12, color: COLOR.muted, letterSpacing: "0.12em" }}>{tokenSymbol}</span>
        {refreshing ? <Spinner size={14} color={COLOR.text3} /> : null}
      </div>
      {balanceError != null ? (
        <div style={{ fontSize: 11, color: COLOR.redSoft, marginTop: 8, lineHeight: 1.5 }}>
          Balance lookup failed: {balanceError}
        </div>
      ) : null}
    </ACard>
  );
}
