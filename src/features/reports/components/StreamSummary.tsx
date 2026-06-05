/**
 * Totals card for the Reports → Transactions stream.
 *
 * Shows the count, per-asset Finished volume, the active window label,
 * and a short "X / N days decrypted" status when the stream is still
 * resolving. The asset totals are gross — refunds aren't subtracted (see
 * `summarize`'s contract).
 */

import { useMemo } from "react";

import {
  summarize,
  type StreamSummaryByAsset,
  type StreamTransaction,
  type StreamWindow,
} from "@features/reports/transaction-stream.ts";
import { ACard } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface StreamSummaryProps {
  readonly transactions: ReadonlyArray<StreamTransaction>;
  readonly window: StreamWindow;
  readonly terminalCount: number;
  readonly state: "loading" | "partial" | "ready";
  readonly loadedDays: number;
  readonly totalDays: number;
}

export function StreamSummary({
  transactions,
  window,
  terminalCount,
  state,
  loadedDays,
  totalDays,
}: StreamSummaryProps) {
  const summary = useMemo(() => summarize(transactions), [transactions]);
  const totals = useMemo(() => {
    const out: Array<readonly [string, StreamSummaryByAsset]> = [];
    for (const entry of summary.finishedByAsset.entries()) out.push(entry);
    out.sort((a, b) => b[1].amount - a[1].amount);
    return out;
  }, [summary]);

  const headline =
    summary.count === 0
      ? "No transactions in window"
      : `${formatCount(summary.count)} transaction${summary.count === 1 ? "" : "s"}`;

  return (
    <ACard padding={14}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: 22,
            letterSpacing: "-0.02em",
            color: COLOR.text,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontFamily: FONT.mono, fontSize: 13, color: COLOR.text2 }}>
          {totals.length === 0 ? (
            <span style={{ color: COLOR.muted }}>—</span>
          ) : (
            totals.map(([asset, byAsset]) => (
              <span key={asset}>
                {formatAmount(byAsset.amount)} <span style={{ color: COLOR.text3 }}>{asset}</span>
              </span>
            ))
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: COLOR.text3,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span>
          Across {terminalCount} terminal{terminalCount === 1 ? "" : "s"}
        </span>
        <span style={{ color: COLOR.faint }}>·</span>
        <span>{windowLabel(window)}</span>
        {state !== "ready" && totalDays > 0 ? (
          <>
            <span style={{ color: COLOR.faint }}>·</span>
            <span style={{ color: COLOR.amberSoft }}>
              Decrypting {loadedDays} of {totalDays} day{totalDays === 1 ? "" : "s"}…
            </span>
          </>
        ) : null}
      </div>
    </ACard>
  );
}

function windowLabel(window: StreamWindow): string {
  switch (window) {
    case "24h":
      return "Last 24 hours";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
  }
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Render an asset total. We have no per-asset decimals contract, so
 * pick a sensible default precision based on magnitude: integers stay
 * exact, sub-unit values get 4 decimals for readability.
 */
function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const fractionDigits = abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
