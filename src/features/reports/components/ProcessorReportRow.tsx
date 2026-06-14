// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * One published Z report in a processor group's list. The collapsed row shows
 * the public on-chain metadata (seq, committed time, ciphertext size) and —
 * once decrypted — the grand total. Expanding reveals the per-terminal
 * rollup and the payments table: one row per line item (= one payment).
 */
import { useState } from "react";

import { gatewayUrlForCid } from "@features/items/contracts/item-config-storage.ts";
import { shortAddr, formatIsoDateTime } from "@features/merchant/merchant-model.ts";
import type { ProcessorReportIndexEntry } from "@features/reports/contracts/processor-report-read.ts";
import type { ProcessorReportLoadResult } from "@features/reports/contracts/processor-report-queries.ts";
import {
  formatReportAmount,
  processorReportToCsv,
  type ProcessorReportDoc,
} from "@features/reports/processor-report.ts";
import { ACard, AMono, ASecondary } from "@shared/components/primitives.tsx";
import { exportFile } from "@shared/utils/export-file.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface ProcessorReportRowProps {
  readonly entry: ProcessorReportIndexEntry;
  readonly result: ProcessorReportLoadResult | undefined;
  readonly locked: boolean;
  readonly gatewayBase: string;
}

export function ProcessorReportRow({ entry, result, locked, gatewayBase }: ProcessorReportRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <ACard padding={0}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
          color: COLOR.text,
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            fontWeight: 600,
            color: COLOR.text2,
            background: COLOR.surface2,
            borderRadius: 6,
            padding: "3px 8px",
            flex: "0 0 auto",
          }}
        >
          Z·{String(entry.seq).padStart(4, "0")}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLOR.text }}>
            {formatIsoDateTime(entry.committedAt)}
          </div>
          <div style={{ fontSize: 11, color: COLOR.faint, marginTop: 2 }}>{entry.size} bytes</div>
        </div>
        <RowSummary locked={locked} result={result} />
      </button>

      {open ? (
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLOR.border}` }}>
          <ExpandedBody entry={entry} result={result} locked={locked} gatewayBase={gatewayBase} />
        </div>
      ) : null}
    </ACard>
  );
}

function RowSummary({
  locked,
  result,
}: {
  locked: boolean;
  result: ProcessorReportLoadResult | undefined;
}) {
  if (locked) {
    return <span style={{ fontSize: 11, color: COLOR.muted, flex: "0 0 auto" }}>Locked — enter the group passkey</span>;
  }
  if (result == null) {
    return <span style={{ fontSize: 11, color: COLOR.muted, flex: "0 0 auto" }}>Decrypting…</span>;
  }
  if (result.kind === "ready") {
    return (
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, flex: "0 0 auto" }}>
        <span style={{ fontSize: 11, color: COLOR.muted }}>{result.doc.count} payments</span>
        <AMono size={13} color={COLOR.text}>
          {formatReportAmount(result.doc.grandTotalPlanck, result.doc.token)}
        </AMono>
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, color: COLOR.redSoft, flex: "0 0 auto" }}>
      {result.kind === "decrypt-error" ? "Wrong passkey" : "Unreadable"}
    </span>
  );
}

function ExpandedBody({
  entry,
  result,
  locked,
  gatewayBase,
}: {
  entry: ProcessorReportIndexEntry;
  result: ProcessorReportLoadResult | undefined;
  locked: boolean;
  gatewayBase: string;
}) {
  if (locked) {
    return (
      <div style={{ paddingTop: 12, fontSize: 12, color: COLOR.muted, lineHeight: 1.55 }}>
        This report is encrypted with the group passkey. Unlock above to view it.
      </div>
    );
  }
  if (result == null) {
    return (
      <div style={{ paddingTop: 12, fontSize: 12, color: COLOR.muted }}>
        Loading report…
      </div>
    );
  }
  if (result.kind === "decrypt-error") {
    return (
      <div style={{ paddingTop: 12, fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
        Wrong passkey, or the envelope was tampered with.
      </div>
    );
  }
  if (result.kind === "fetch-error" || result.kind === "invalid") {
    return (
      <div style={{ paddingTop: 12, fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
        {result.reason}
      </div>
    );
  }
  return <ReadyBody doc={result.doc} entry={entry} gatewayBase={gatewayBase} />;
}

function ReadyBody({
  doc,
  entry,
  gatewayBase,
}: {
  doc: ProcessorReportDoc;
  entry: ProcessorReportIndexEntry;
  gatewayBase: string;
}) {
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const csvCopyLabel = `csv:${doc.groupId}:${doc.seq}`;
  const csvCopied = useFeedbackStore((s) => s.copiedField) === csvCopyLabel;
  return (
    <>
      <div style={{ paddingTop: 12, fontSize: 11, color: COLOR.muted }}>
        Blocks {doc.toBlock >= doc.fromBlock ? `${doc.fromBlock}–${doc.toBlock}` : "—"} · per-terminal totals
      </div>
      <div style={{ marginTop: 6 }}>
        {doc.lines.map((line) => (
          <div
            key={line.terminalId}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 0",
              borderBottom: `1px solid ${COLOR.surface2}`,
            }}
          >
            <span style={{ flex: 1, fontSize: 12.5, color: COLOR.text2 }}>{line.terminalId}</span>
            <span style={{ fontSize: 11, color: COLOR.faint, width: 50, textAlign: "right" }}>{line.count}×</span>
            <AMono size={12} color={COLOR.text2}>{formatReportAmount(line.totalPlanck, doc.token)}</AMono>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 11, color: COLOR.muted }}>
        Payments ({doc.payments.length})
      </div>
      {doc.payments.length === 0 ? (
        <div style={{ marginTop: 6, fontSize: 12, color: COLOR.text3 }}>
          No individual payments recorded in this report.
        </div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {doc.payments.map((p) => (
            <div
              key={p.paymentId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
                borderBottom: `1px solid ${COLOR.surface2}`,
                fontSize: 11.5,
              }}
            >
              <span style={{ color: COLOR.text3, flex: "0 0 auto" }}>
                {formatIsoDateTime(new Date(p.observedAtMs).toISOString())}
              </span>
              <span style={{ color: COLOR.text2, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.terminalId}
              </span>
              {p.blockNumber != null ? (
                <span style={{ color: COLOR.faint, flex: "0 0 auto" }}>#{p.blockNumber}</span>
              ) : (
                <span style={{ color: COLOR.faint, flex: "0 0 auto" }}>coin</span>
              )}
              {p.fromHex != null ? (
                <AMono size={11} color={COLOR.faint}>{shortAddr(p.fromHex, 6, 4)}</AMono>
              ) : null}
              <AMono size={12} color={COLOR.text}>{formatReportAmount(p.amountPlanck, doc.token)}</AMono>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <ASecondary
          full={false}
          onClick={() => {
            window.open(gatewayUrlForCid(gatewayBase, entry.cid), "_blank", "noopener");
          }}
        >
          Open IPFS
        </ASecondary>
        <ASecondary full={false} onClick={() => downloadProcessorReportCsv(doc)}>
          Download CSV
        </ASecondary>
        <ASecondary
          full={false}
          onClick={() => copyValue(processorReportToCsv(doc), csvCopyLabel)}
        >
          {csvCopied ? "Copied" : "Copy CSV"}
        </ASecondary>
      </div>
    </>
  );
}

function downloadProcessorReportCsv(doc: ProcessorReportDoc): void {
  void exportFile({
    fileName: `w3spay-z-report-${doc.groupId}-${String(doc.seq).padStart(4, "0")}.csv`,
    content: processorReportToCsv(doc),
    mimeType: "text/csv",
  });
}
