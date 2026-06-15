// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { envConfig } from "@/config";
import { useDecryptedReport } from "@features/reports/contracts/report-queries.ts";
import { resolveNetwork } from "@shared/chain/host";
import { gatewayUrlForCid } from "@features/items/contracts/item-config-storage.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import {
  dailyReportToCsv,
  type DailyReport,
  type DailyReportTransaction,
} from "@features/reports/daily-report.ts";
import type { ReportIndexEntry } from "@features/reports/contracts/bulletin-index-read.ts";
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
  readonly passwords: ReadonlyArray<string>;
  readonly unlockNonce: number;
  readonly onClose: () => void;
}

export function ReportDetailPanel({ entry, passwords, unlockNonce, onClose }: ReportDetailPanelProps) {
  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const state = useDecryptedReport({
    cid: entry.metadata.cid,
    passwords,
    unlockNonce,
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

      {passwords.length === 0 ? (
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
          Enter the report passcode above, or scan a Configure T3rminal QR from
          this device, to decrypt this terminal's reports.
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
            " — wrong passcode or corrupted ciphertext. Days uploaded under an older passcode need that passcode." +
            (state.meta.keyFingerprint
              ? ` Report key fingerprint: ${state.meta.keyFingerprint}.`
              : "")
          }
        />
      ) : state.kind === "parse-error" ? (
        <ErrorBox
          headline="Payload decrypted but doesn't match the report shape"
          detail="The producer may be on a newer schema. Use 'Open IPFS' to inspect the raw envelope."
        />
      ) : (
        <DecryptedReportBody report={state.report} dateLabel={entry.date} />
      )}

      <div style={{ height: 10 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <ASecondary
          onClick={() => {
            window.open(gatewayHref, "_blank", "noopener");
          }}
        >
           Open IPFS
        </ASecondary>
        {state.kind === "ready" ? (
          <>
            <ASecondary onClick={() => downloadReportJson(entry.date, state.report)}>
             Download JSON
            </ASecondary>
            <ASecondary onClick={() => downloadReportCsv(entry.date, state.report)}>
              Download CSV
            </ASecondary>
          </>
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
  dateLabel,
}: {
  report: DailyReport;
  dateLabel: string;
}) {
  return (
    <>
      <AEye>Transactions ({report.transactions.length})</AEye>
      {report.transactions.length === 0 ? (
        <div style={{ marginTop: 6, color: COLOR.text3, fontSize: 12 }}>
          The report has no transactions recorded for {dateLabel}.
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {report.transactions.map((tx) => (
            <TransactionLine key={tx.saleId} tx={tx} />
          ))}
        </div>
      )}
    </>
  );
}

function TransactionLine({ tx }: { tx: DailyReportTransaction }) {
  const refunded = tx.status === "Refunded";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 0",
        borderBottom: `1px solid ${COLOR.surface2}`,
        fontSize: 11.5,
      }}
    >
      <span style={{ color: COLOR.text3, flex: "0 0 auto" }}>{tx.timestampFormatted}</span>
      <span
        style={{
          color: COLOR.text2,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tx.saleId}
      </span>
      {refunded ? (
        <span
          style={{
            color: COLOR.amberSoft,
            flex: "0 0 auto",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          refund
        </span>
      ) : null}
      {tx.blockNumber ? (
        <span style={{ color: COLOR.faint, flex: "0 0 auto" }}>#{tx.blockNumber}</span>
      ) : null}
      <AMono size={12} color={refunded ? COLOR.amberSoft : COLOR.text}>
        {tx.amountFormatted} {tx.asset}
      </AMono>
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

function downloadReportCsv(date: string, report: DailyReport): void {
  void exportFile({
    fileName: `daily-report-${date}.csv`,
    content: dailyReportToCsv(report),
    mimeType: "text/csv",
  });
}
