/**
 * Single row in the transactions stream. Tap toggles inline detail
 * expansion; the parent owns "which sale is expanded" state because
 * only one row is open at a time.
 *
 * The row layout adapts to two contexts via `hideTerminalColumn`:
 *
 *   - Aggregate view: shows `<time> · <terminal> · <amount> <asset> <status>`
 *   - Per-terminal view: shows `<time> · <amount> <asset> <status>`
 *
 * Refund rows keep the same shape; the refund-of saleId is surfaced in
 * the inline detail panel (see `TransactionDetailInline`), with a small
 * subline pointer here so the operator can spot refunds from the row.
 */

import type { StreamTransaction } from "@features/reports/transaction-stream.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AMono } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface TransactionRowProps {
  readonly entry: StreamTransaction;
  readonly expanded: boolean;
  readonly hideTerminalColumn: boolean;
  readonly onToggle: () => void;
}

export function TransactionRow({
  entry,
  expanded,
  hideTerminalColumn,
  onToggle,
}: TransactionRowProps) {
  const { tx, terminal, dateBucket, timestampMs } = entry;
  const isRefund = tx.status === "Refunded";

  return (
    <ACard onClick={onToggle} padding={12}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: COLOR.text3,
              whiteSpace: "nowrap",
              minWidth: 56,
            }}
          >
            {formatTime(timestampMs, dateBucket)}
          </div>
          {!hideTerminalColumn ? (
            <div
              style={{
                fontSize: 12,
                color: COLOR.text2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
              title={terminal.name}
            >
              {terminal.name}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: FONT.mono,
              fontSize: 13,
              color: COLOR.text,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tx.amountFormatted} {tx.asset}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusPill status={tx.status} />
          <span
            style={{
              color: COLOR.text3,
              transition: "transform .15s",
              transform: expanded ? "rotate(90deg)" : "none",
            }}
          >
            <Icon name="chevron-right" size={12} />
          </span>
        </div>
      </div>
      {isRefund && typeof tx.refundOf === "string" && tx.refundOf.length > 0 ? (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: COLOR.amberSoft,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: COLOR.text3 }}>↳</span>
          <span>refund of</span>
          <AMono size={11} color={COLOR.text3} weight={400}>
            {shortAddr(tx.refundOf, 10, 6)}
          </AMono>
        </div>
      ) : null}
    </ACard>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "Finished";
  const bg = ok ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)";
  const fg = ok ? COLOR.greenSoft : COLOR.amberSoft;
  const border = ok ? "rgba(34,197,94,0.30)" : "rgba(245,158,11,0.30)";
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

/**
 * Render a row timestamp. Falls back to the date-bucket label when the
 * producer's timestamp was unparseable (`timestampMs === 0` per
 * `flattenReports`'s contract).
 */
function formatTime(timestampMs: number, dateBucket: string): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return dateBucket;
  const d = new Date(timestampMs);
  // `Mon 14:32` style — short weekday + HH:mm in the user's local TZ.
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${weekday} ${hh}:${mm}`;
}
