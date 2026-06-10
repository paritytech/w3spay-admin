// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { envConfig } from "@/config";
import { useDecryptedReport } from "@features/reports/contracts/report-queries.ts";
import { resolveNetwork } from "@shared/chain/host";
import { gatewayUrlForCid } from "@features/items/contracts/item-config-storage.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import type {
  DailyReport,
  DailyReportTransaction,
} from "@features/reports/daily-report.ts";
import type { ReportIndexEntry } from "@features/reports/contracts/bulletin-index-read.ts";
import type { T3rminalAssignmentV1 } from "@shared/store/t3rminal-assignments.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  ADotted,
  AEye,
  AGhost,
  AMono,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { exportFile } from "@shared/utils/export-file.ts";

export interface ReportDetailPanelProps {
  readonly entry: ReportIndexEntry;
  readonly assignment: T3rminalAssignmentV1 | null;
  readonly onClose: () => void;
}

export function ReportDetailPanel({ entry, assignment, onClose }: ReportDetailPanelProps) {
  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const state = useDecryptedReport({
    cid: entry.metadata.cid,
    reportPassword: assignment?.reportPassword ?? null,
    gatewayBase,
  });

  const gatewayHref = gatewayUrlForCid(gatewayBase, entry.metadata.cid);

  return (
    <ACard padding={16}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <AEye>{entry.date}</AEye>
        <AGhost onClick={onClose}>
          <Icon name="x" size={12} /> Close
        </AGhost>
      </div>

      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: 28,
          letterSpacing: "-0.02em",
          color: COLOR.text,
          lineHeight: 1.1,
          marginBottom: 6,
        }}
      >
        {entry.date}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLOR.text3, fontSize: 11 }}>
        <Icon name="info" size={11} />
        <span>cid</span>
        <AMono size={11} color={COLOR.text3} weight={400}>
          {shortAddr(entry.metadata.cid, 12, 8)}
        </AMono>
      </div>

      <ADotted margin={14} />

      {assignment == null ? (
        <div
          style={{
            padding: 10,
            border: `1px solid ${COLOR.border}`,
            background: "rgba(245,158,11,0.06)",
            borderRadius: 10,
            fontSize: 12,
            color: COLOR.amberSoft,
            marginBottom: 12,
          }}
        >
          No QR password on file for this terminal. Issue a QR from “Configure
          T3rminal” first — without it the admin cannot decrypt this terminal's
          reports.
        </div>
      ) : null}

      {state.kind === "idle" || state.kind === "loading" ? (
        <LoadingStatus />
      ) : state.kind === "legacy-v1" ? (
        <LegacyV1Notice meta={state.meta} />
      ) : state.kind === "fetch-error" ? (
        <ErrorBox
          headline="Couldn't load this report"
          detail={state.reason}
          onRetry={state.refresh}
        />
      ) : state.kind === "corrupt" ? (
        <ErrorBox
          headline="Unrecognised payload"
          detail={state.reason}
        />
      ) : state.kind === "decrypt-error" ? (
        <ErrorBox
          headline="Decryption failed"
          detail={
            state.reason +
            " — wrong password or corrupted ciphertext. Regenerating the QR will rotate the password and break older reports."
          }
        />
      ) : state.kind === "parse-error" ? (
        <ErrorBox
          headline="Payload decrypted but doesn't match the report shape"
          detail="The producer may be on a newer schema. Use 'Open IPFS' to inspect the raw envelope."
        />
      ) : (
        <DecryptedReportBody
          report={state.report}
          gatewayHref={gatewayHref}
          dateLabel={entry.date}
        />
      )}

      <div style={{ height: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <ASecondary
          onClick={() => {
            window.open(gatewayHref, "_blank", "noopener");
          }}
        >
          <Icon name="info" size={12} /> Open IPFS
        </ASecondary>
        {state.kind === "ready" ? (
          <ASecondary
            onClick={() => downloadReportJson(entry.date, state.report)}
          >
            <Icon name="info" size={12} /> Download JSON
          </ASecondary>
        ) : null}
      </div>
    </ACard>
  );
}

function LoadingStatus() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: COLOR.muted, fontSize: 12 }}>
      Loading report from Bulletin Chain…
    </div>
  );
}

function LegacyV1Notice({ meta }: { meta: { date: string; txCount: number } | null }) {
  return (
    <div
      style={{
        padding: 14,
        border: `1px solid ${COLOR.border}`,
        background: "rgba(96,165,250,0.06)",
        borderRadius: 10,
        fontSize: 12,
        color: COLOR.text2,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: COLOR.text }}>
        Legacy envelope (v1) — admin cannot decrypt
      </div>
      <div>
        This report was sealed with the old per-recipient X25519 scheme. Only
        the T3rminal device that wrote it (or any recipient it explicitly added)
        can decrypt. The next T3rminal build will emit the v2 password-shared
        envelope and reports from then on will open here.
      </div>
      {meta ? (
        <div style={{ marginTop: 8, fontSize: 11, color: COLOR.muted }}>
          envelope meta · {meta.date} · {meta.txCount} entr{meta.txCount === 1 ? "y" : "ies"}
        </div>
      ) : null}
    </div>
  );
}

function ErrorBox({
  headline,
  detail,
  onRetry,
}: {
  headline: string;
  detail: string;
  onRetry?: () => void;
}) {
  return (
    <div
      style={{
        padding: 14,
        border: `1px solid rgba(239,68,68,0.30)`,
        background: "rgba(239,68,68,0.06)",
        borderRadius: 10,
        fontSize: 12,
        color: COLOR.redSoft,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{headline}</div>
      <div style={{ color: COLOR.text3 }}>{detail}</div>
      {onRetry ? (
        <div style={{ marginTop: 10 }}>
          <ASecondary onClick={onRetry}>
            <Icon name="refresh-cw" size={12} /> Retry
          </ASecondary>
        </div>
      ) : null}
    </div>
  );
}

function DecryptedReportBody({
  report,
  gatewayHref: _gatewayHref,
  dateLabel,
}: {
  report: DailyReport;
  gatewayHref: string;
  dateLabel: string;
}) {
  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <SummaryTile label="Transactions" value={String(report.totalTransactions)} />
        <SummaryTile label="Network" value={report.network} />
        <SummaryTile label="Finalized" value={report.dayFinalized ? "yes" : "no"} />
      </div>

      <AEye>Transactions ({report.transactions.length})</AEye>
      {report.transactions.length === 0 ? (
        <div style={{ marginTop: 6, color: COLOR.text3, fontSize: 12 }}>
          The report has no transactions recorded for {dateLabel}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {report.transactions.map((tx) => (
            <TransactionCard key={tx.saleId} tx={tx} />
          ))}
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 12,
        background: COLOR.surface2,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: COLOR.muted }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: FONT.serif,
          fontSize: 22,
          color: COLOR.text,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function TransactionCard({ tx }: { tx: DailyReportTransaction }) {
  const statusOk = tx.status === "Finished";
  return (
    <div
      style={{
        padding: 12,
        background: COLOR.surface2,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 14, color: COLOR.text }}>
          {tx.amountFormatted} {tx.asset}
        </div>
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "2px 7px",
            borderRadius: 999,
            background: statusOk ? "rgba(34,197,94,0.10)" : "rgba(245,158,11,0.10)",
            color: statusOk ? COLOR.greenSoft : COLOR.amberSoft,
            border: `1px solid ${statusOk ? "rgba(34,197,94,0.30)" : "rgba(245,158,11,0.30)"}`,
          }}
        >
          {tx.status}
        </span>
      </div>
      <div style={{ fontSize: 11, color: COLOR.text3 }}>
        sale {tx.saleId}
      </div>
      {tx.items && tx.items.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          {tx.items.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: COLOR.text3,
                padding: "2px 0",
              }}
            >
              <span>
                {item.quantity} × {item.name}
              </span>
              <AMono size={11} color={COLOR.text3} weight={400}>
                {item.unitPrice}
              </AMono>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function downloadReportJson(date: string, report: DailyReport): void {
  void exportFile({
    fileName: `daily-report-${date}.json`,
    content: JSON.stringify(report, null, 2),
    mimeType: "application/json",
  });
}
