/**
 * Per-terminal Reports drill-in. Same two-segment shape as the Reports
 * tab — Transactions stream (default) vs Daily reports — but scoped to
 * one merchant's `(shopKey, dates)`.
 *
 * The Daily reports segment is the original date-list + inline
 * `ReportDetailPanel` flow; the Transactions segment reuses
 * `TransactionsView` with `hideTerminalColumn={true}` and a single
 * stream input. Both share the same `useReportsCache` so days the user
 * already decrypted in the aggregate view stay decrypted here without
 * a re-fetch.
 *
 * Hides the tab bar (see `route.ts::showTabsForRoute`).
 */

import { useEffect, useMemo, useState } from "react";

import { useMerchants } from "@features/merchant/api/use-merchants.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { envConfig } from "@shared/config.ts";
import { resolveNetwork } from "@shared/api/host";
import {
  useT3rminalReportIndex,
  type ReportIndexEntry,
  type TerminalReportIndexState,
} from "@features/reports/api/report-index-queries.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { T3rminalAssignmentV1 } from "@shared/store/t3rminal-assignments.ts";
import { useT3rminalAssignments } from "@shared/store/use-assignments-store.ts";
import type { TransactionsStreamTerminal } from "@features/reports/transaction-stream.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  AEye,
  AGhost,
  AHead,
  AMono,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { ReportDateRow } from "@features/reports/components/ReportDateRow.tsx";
import { ReportDetailPanel } from "@features/reports/components/ReportDetailPanel.tsx";
import {
  ReportsViewToggle,
  type ReportsViewId,
} from "@features/reports/components/ReportsViewToggle.tsx";
import { TransactionsView } from "@features/reports/components/TransactionsView.tsx";

export interface ReportsTerminalProps {
  readonly merchantKey: string;
}

export function ReportsTerminal({ merchantKey }: ReportsTerminalProps) {
  const { merchants } = useMerchants();
  const { assignments } = useT3rminalAssignments();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const merchant = useMemo(
    () => merchants.find((m) => m.key === merchantKey),
    [merchants, merchantKey],
  );
  const assignment = assignments.get(merchantKey) ?? null;

  const shopKey = merchant != null ? (merchant.key.toLowerCase() as `0x${string}`) : null;
  const indexState = useT3rminalReportIndex(shopKey);

  const [view, setView] = useState<ReportsViewId>("transactions");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // If the merchant disappears mid-view (e.g. user removed via another
  // surface), close any open detail so we don't render against stale data.
  useEffect(() => {
    if (merchant == null) setSelectedDate(null);
  }, [merchant]);

  const entries = indexState.kind === "ready" ? indexState.index.entries : [];

  // Hooks must precede early returns — compute the stream input up front
  // even when the merchant resolves to "missing" / "wrong-kind". An empty
  // terminal list is the correct fall-back for those branches anyway.
  const streamTerminals = useMemo<ReadonlyArray<TransactionsStreamTerminal>>(
    () =>
      shopKey == null || merchant == null || merchant.kind !== "t3rminal"
        ? []
        : [
            {
              terminal: {
                key: merchant.key,
                name: merchant.name,
                terminalId: merchant.terminalId,
              },
              shopKey,
              reportPassword: assignment?.reportPassword ?? null,
              entries,
            },
          ],
    [shopKey, merchant, assignment, entries],
  );

  const backToReports = () =>
    canGoBack ? router.history.back() : navigate({ to: "/reports" });

  if (merchant == null) {
    return (
      <>
        <AGhost onClick={backToReports}>
          <Icon name="chevron-left" size={14} /> Back to reports
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          Merchant not found.
        </div>
      </>
    );
  }
  if (merchant.kind !== "t3rminal") {
    return (
      <>
        <AGhost onClick={backToReports}>
          <Icon name="chevron-left" size={14} /> Back to reports
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          {merchant.name} is a POS terminal — only T3rminal devices upload
          daily reports.
        </div>
      </>
    );
  }

  const selectedEntry =
    selectedDate != null
      ? entries.find((entry) => entry.date === selectedDate) ?? null
      : null;

  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;

  const indexReady = indexState.kind === "ready";
  const indexFailed =
    indexState.kind === "error" || indexState.kind === "config-error";

  return (
    <>
      <AGhost onClick={backToReports}>
        <Icon name="chevron-left" size={14} /> Back to reports
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="T3rminal reports" title={merchant.name} size={28} />
      <Subhead merchant={merchant} assignment={assignment} />

      <div style={{ height: 14 }} />
      <ReportsViewToggle value={view} onChange={setView} />
      <div style={{ height: 14 }} />

      {indexFailed ? (
        <IndexError state={indexState} />
      ) : view === "transactions" ? (
        <TransactionsView
          terminals={streamTerminals}
          hideTerminalColumn
          gatewayBase={gatewayBase}
          indexReady={indexReady}
        />
      ) : (
        <DaysSegment
          state={indexState}
          entries={entries}
          selectedDate={selectedDate}
          selectedEntry={selectedEntry}
          assignment={assignment}
          onSelect={(date) => setSelectedDate(date)}
        />
      )}
    </>
  );
}

function Subhead({
  merchant,
  assignment,
}: {
  merchant: AdminMerchant;
  assignment: T3rminalAssignmentV1 | null;
}) {
  return (
    <ACard padding={14} style={{ marginTop: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11, color: COLOR.muted }}>
          <span style={{ marginRight: 6 }}>terminalKey</span>
          <AMono size={11} color={COLOR.text3} weight={400}>
            {merchant.key.slice(0, 14)}…{merchant.key.slice(-6)}
          </AMono>
        </div>
        {assignment == null ? (
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(245,158,11,0.10)",
              color: COLOR.amberSoft,
              border: `1px solid rgba(245,158,11,0.30)`,
            }}
          >
            No QR
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(34,197,94,0.10)",
              color: COLOR.greenSoft,
              border: `1px solid rgba(34,197,94,0.30)`,
            }}
          >
            QR ready
          </span>
        )}
      </div>
    </ACard>
  );
}

function DaysSegment({
  state,
  entries,
  selectedDate,
  selectedEntry,
  assignment,
  onSelect,
}: {
  state: TerminalReportIndexState;
  entries: ReadonlyArray<ReportIndexEntry>;
  selectedDate: string | null;
  selectedEntry: ReportIndexEntry | null;
  assignment: T3rminalAssignmentV1 | null;
  onSelect: (date: string | null) => void;
}) {
  return (
    <>
      {selectedEntry ? (
        <>
          <ReportDetailPanel
            entry={selectedEntry}
            assignment={assignment}
            onClose={() => onSelect(null)}
          />
          <div style={{ height: 14 }} />
        </>
      ) : null}

      <AEye>Saved days</AEye>
      <div style={{ height: 6 }} />

      <DatesBody
        state={state}
        entries={entries}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    </>
  );
}

function IndexError({
  state,
}: {
  state: TerminalReportIndexState;
}) {
  if (state.kind === "config-error") {
    return (
      <ACard padding={14}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
          Reports index isn't configured: {state.reason}. Set
          <code style={{ margin: "0 4px", color: COLOR.text2 }}>
            VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS
          </code>
          and reload.
        </div>
      </ACard>
    );
  }
  if (state.kind === "error") {
    return (
      <ACard padding={14}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
          Couldn't read the report index: {state.reason}
        </div>
        <div style={{ marginTop: 10 }}>
          <ASecondary onClick={state.refresh}>
            <Icon name="refresh-cw" size={12} /> Retry
          </ASecondary>
        </div>
      </ACard>
    );
  }
  return null;
}

function DatesBody({
  state,
  entries,
  selectedDate,
  onSelect,
}: {
  state: TerminalReportIndexState;
  entries: ReadonlyArray<ReportIndexEntry>;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: COLOR.muted,
          fontSize: 12,
        }}
      >
        Reading the report index…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <ACard padding={14}>
        <div style={{ color: COLOR.text3, fontSize: 12, lineHeight: 1.55 }}>
          No daily reports stored on chain for this terminal yet. T3rminal
          devices upload at end-of-day; until the device finalizes a day
          under this terminal's registry key, this list stays empty.
        </div>
      </ACard>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {entries.map((entry) => (
        <ReportDateRow
          key={entry.date}
          entry={entry}
          onClick={() =>
            onSelect(selectedDate === entry.date ? null : entry.date)
          }
        />
      ))}
    </div>
  );
}
