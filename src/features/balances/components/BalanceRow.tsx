/**
 * Single merchant row in the Balances tab — leaderboard-style rank,
 * name, terminal/short address, token balance.
 */

import { useConfig } from "@shared/config";
import { shortAddr, shortTerminalId, type AdminMerchant } from "@features/merchant/merchant-model.ts";
import { formatTokenAmount } from "@features/balances/contracts/token-balance.ts";
import { AMono, type Density } from "@shared/components/primitives.tsx";
import { Spinner } from "@shared/components/Spinner.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface BalanceRowProps {
  m: AdminMerchant;
  density: Density;
  rank: number;
  balance: bigint | undefined;
  balanceLoading: boolean;
  onClick: () => void;
}

export function BalanceRow({
  m,
  density,
  rank,
  balance,
  balanceLoading,
  onClick,
}: BalanceRowProps) {
  const compact = density === "compact";
  const tokenSymbol = useConfig().token.symbol;
  return (
    <div
      onClick={onClick}
      style={{
        background: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
        padding: compact ? "10px 12px" : "12px 14px",
        cursor: "pointer",
        transition: "background .15s, border-color .15s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLOR.border2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLOR.border;
      }}
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            color: rank <= 3 ? COLOR.text : COLOR.muted,
            width: 18,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {rank.toString().padStart(2, "0")}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: compact ? 14 : 16,
                letterSpacing: "-0.02em",
                color: COLOR.text,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 3,
                color: COLOR.muted,
                fontSize: 10.5,
              }}
            >
              <AMono size={10.5} color={COLOR.text3} weight={400}>
                {shortTerminalId(m.terminalId)}
              </AMono>
              <span>·</span>
              <AMono size={10.5} color={COLOR.muted} weight={400}>
                {shortAddr(m.destinationSs58)}
              </AMono>
              {m.status === "paused" ? (
                <>
                  <span>·</span>
                  <span
                    style={{
                      color: COLOR.amberSoft,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontSize: 9,
                      fontWeight: 600,
                    }}
                  >
                    paused
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              flexShrink: 0,
              minWidth: 90,
            }}
          >
            {balanceLoading ? (
              <Spinner size={compact ? 13 : 15} color={COLOR.text3} label="Loading balance" />
            ) : (
              <AMono size={compact ? 13 : 15} color={COLOR.text} weight={500}>
                {formatTokenAmount(balance)}
              </AMono>
            )}
            <span
              style={{
                fontSize: 9.5,
                color: COLOR.muted,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {tokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
