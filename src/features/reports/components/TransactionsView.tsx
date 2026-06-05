/**
 * Orchestrator for the Reports → Transactions stream view.
 *
 * Used by both the aggregate Reports tab (many terminals) and the
 * per-terminal drill-in (one terminal, with the terminal column
 * suppressed). The caller resolves index entries + QR passwords; this
 * component owns the period / status filter / pagination / inline
 * expansion state and the resulting fan-out via
 * {@link useTransactionsStream}.
 *
 * Defaults: period = 7d, page size = 50, status filter = all. State
 * lives in local React state so deep-linking isn't supported — a
 * later iteration can promote it to the hash route if needed.
 */

import { useMemo, useState } from "react";

import { useTransactionsStream } from "@features/reports/api/report-queries.ts";
import type {
  StreamTransaction,
  StreamWindow,
  TransactionsStreamTerminal,
} from "@features/reports/transaction-stream.ts";
import { useNavigate } from "@tanstack/react-router";
import { ACard } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { LoadMoreFooter } from "./LoadMoreFooter.tsx";
import { PeriodPicker } from "./PeriodPicker.tsx";
import { StatusFilter, type StatusFilterId } from "./StatusFilter.tsx";
import { StreamSummary } from "./StreamSummary.tsx";
import { TransactionDetailInline } from "./TransactionDetailInline.tsx";
import { TransactionRow } from "./TransactionRow.tsx";

const PAGE_SIZE = 50;

export interface TransactionsViewProps {
  readonly terminals: ReadonlyArray<TransactionsStreamTerminal>;
  /** When true the row + detail layouts hide terminal labels. */
  readonly hideTerminalColumn: boolean;
  readonly gatewayBase: string;
  /**
   * Whether the parent is still resolving the per-terminal `(date, cid)`
   * index. Until this is `true` the view shows an "indexing" status so
   * we don't paint the empty state prematurely.
   */
  readonly indexReady: boolean;
}

export function TransactionsView({
  terminals,
  hideTerminalColumn,
  gatewayBase,
  indexReady,
}: TransactionsViewProps) {
  const [streamWindow, setStreamWindow] = useState<StreamWindow>("7d");
  const [status, setStatus] = useState<StatusFilterId>("all");
  const [page, setPage] = useState(1);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const navigate = useNavigate();

  const stream = useTransactionsStream({
    terminals,
    window: streamWindow,
    gatewayBase,
  });

  const visibleTransactions = useMemo(
    () => filterByStatus(stream.transactions, status),
    [stream.transactions, status],
  );

  const visibleCount = page * PAGE_SIZE;
  const visible = visibleTransactions.slice(0, visibleCount);

  // Reset pagination when the underlying scope changes — the user
  // selecting a new window or filter wants to start at the top.
  const scopeKey = `${streamWindow}|${status}|${terminals.length}`;
  const [lastScope, setLastScope] = useState(scopeKey);
  if (lastScope !== scopeKey) {
    setLastScope(scopeKey);
    setPage(1);
    setExpandedSaleId(null);
  }

  const showNoTerminals = terminals.length === 0;
  const indexLoading = !indexReady && terminals.length > 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <PeriodPicker value={streamWindow} onChange={setStreamWindow} />
        <StatusFilter value={status} onChange={setStatus} />
      </div>

      {showNoTerminals ? null : (
        <div style={{ marginBottom: 12 }}>
          <StreamSummary
            transactions={visibleTransactions}
            window={streamWindow}
            terminalCount={terminals.length}
            state={indexLoading ? "loading" : stream.state}
            loadedDays={stream.loadedDays}
            totalDays={stream.totalDays}
          />
        </div>
      )}

      {stream.missingPasswordTerminals.length > 0 ? (
        <MissingPasswordBanner
          terminals={stream.missingPasswordTerminals}
          onConfigure={(merchantKey) =>
            navigate({ to: "/merchants/$merchantKey/configure", params: { merchantKey } })
          }
        />
      ) : null}

      {showNoTerminals ? (
        <ACard padding={16}>
          <div style={{ color: COLOR.text3, fontSize: 12, lineHeight: 1.55 }}>
            No T3rminal terminals registered yet. Register a T3rminal merchant
            from the Merchants tab to start seeing transactions here.
          </div>
        </ACard>
      ) : indexLoading ? (
        <div
          style={{
            padding: 20,
            textAlign: "center",
            color: COLOR.muted,
            fontSize: 12,
          }}
        >
          Reading the report index…
        </div>
      ) : visible.length === 0 ? (
        <EmptyStream
          totalDays={stream.totalDays}
          state={stream.state}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((entry) => {
            const expanded = expandedSaleId === entry.tx.saleId;
            return (
              <div key={rowKey(entry)}>
                <TransactionRow
                  entry={entry}
                  expanded={expanded}
                  hideTerminalColumn={hideTerminalColumn}
                  onToggle={() =>
                    setExpandedSaleId(expanded ? null : entry.tx.saleId)
                  }
                />
                {expanded ? (
                  <TransactionDetailInline
                    entry={entry}
                    hideTerminalColumn={hideTerminalColumn}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {visible.length > 0 ? (
        <LoadMoreFooter
          visible={visible.length}
          total={visibleTransactions.length}
          pageSize={PAGE_SIZE}
          onLoadMore={() => setPage((p) => p + 1)}
        />
      ) : null}

      {stream.failures.length > 0 ? (
        <FailuresBanner failures={stream.failures} />
      ) : null}
    </>
  );
}

// ── Sub-blocks ─────────────────────────────────────────────────────

function EmptyStream({
  totalDays,
  state,
}: {
  totalDays: number;
  state: "loading" | "partial" | "ready";
}) {
  if (totalDays === 0) {
    return (
      <ACard padding={16}>
        <div style={{ color: COLOR.text3, fontSize: 12, lineHeight: 1.55 }}>
          No daily reports have been published in this window. T3rminal
          devices upload at end-of-day; once a day finalizes, its
          transactions appear here.
        </div>
      </ACard>
    );
  }
  return (
    <ACard padding={16}>
      <div style={{ color: COLOR.text3, fontSize: 12, lineHeight: 1.55 }}>
        {state === "ready"
          ? "No transactions match this filter in the current window."
          : "Decrypting daily reports — transactions will appear as each day resolves."}
      </div>
    </ACard>
  );
}

function MissingPasswordBanner({
  terminals,
  onConfigure,
}: {
  terminals: ReadonlyArray<{ key: string; name: string }>;
  onConfigure: (merchantKey: string) => void;
}) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        border: "1px solid rgba(245,158,11,0.30)",
        background: "rgba(245,158,11,0.06)",
        borderRadius: 10,
        fontSize: 12,
        color: COLOR.amberSoft,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: COLOR.text }}>
        {terminals.length} terminal{terminals.length === 1 ? "" : "s"} without a
        QR password
      </div>
      <div style={{ color: COLOR.text3 }}>
        Their daily reports are listed but cannot be decrypted from this
        console. Issue a QR per terminal from{" "}
        <span style={{ color: COLOR.text2 }}>Configure T3rminal</span>:
      </div>
      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {terminals.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onConfigure(t.key)}
            style={{
              background: "transparent",
              color: COLOR.text2,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 999,
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function FailuresBanner({
  failures,
}: {
  failures: ReadonlyArray<{ terminalName: string; date: string; reason: string; kind: string }>;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(239,68,68,0.30)",
        background: "rgba(239,68,68,0.06)",
        borderRadius: 10,
        fontSize: 11,
        color: COLOR.redSoft,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {failures.length} day{failures.length === 1 ? "" : "s"} couldn't be loaded
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: COLOR.text3 }}>
        {failures.slice(0, 6).map((f, i) => (
          <li key={`${f.terminalName}-${f.date}-${i}`}>
            {f.terminalName} · {f.date}: {f.reason}
          </li>
        ))}
        {failures.length > 6 ? (
          <li>… and {failures.length - 6} more.</li>
        ) : null}
      </ul>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function filterByStatus(
  transactions: ReadonlyArray<StreamTransaction>,
  status: StatusFilterId,
): ReadonlyArray<StreamTransaction> {
  if (status === "all") return transactions;
  if (status === "finished") {
    return transactions.filter((t) => t.tx.status === "Finished");
  }
  return transactions.filter(
    (t) => t.tx.status === "Refunded" || (typeof t.tx.refundOf === "string" && t.tx.refundOf.length > 0),
  );
}

/**
 * Row key — `saleId` alone isn't sufficient because a refund of a sale
 * carries the same `refundOf` chain. The pair `(terminalKey, saleId)`
 * is unique per producer.
 */
function rowKey(entry: StreamTransaction): string {
  return `${entry.terminal.key}|${entry.tx.saleId}`;
}
