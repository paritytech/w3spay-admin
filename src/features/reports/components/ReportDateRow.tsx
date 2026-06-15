// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { ReportIndexEntry } from "@features/reports/contracts/bulletin-index-read.ts";
import type { DecryptedReportLoadResult } from "@features/reports/contracts/report-queries.ts";
import { formatDailyReportTotals, summarizeDailyReport } from "@features/reports/daily-report.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AMono } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface ReportDateRowProps {
  readonly entry: ReportIndexEntry;
  readonly result: DecryptedReportLoadResult | undefined;
  readonly locked: boolean;
  readonly onClick: () => void;
}

export function ReportDateRow({ entry, result, locked, onClick }: ReportDateRowProps) {
  const { date, metadata } = entry;
  const publishedAt = metadata.publishedAt > 0 ? new Date(metadata.publishedAt * 1000) : null;
  return (
    <ACard onClick={onClick} padding={14}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div style={{ fontFamily: FONT.serif, fontSize: 22, letterSpacing: "-0.02em", color: COLOR.text }}>
              {date}
            </div>
            <span style={{ fontSize: 11, color: COLOR.muted }}>
              {metadata.entryCount} entr{metadata.entryCount === 1 ? "y" : "ies"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: COLOR.muted,
              fontSize: 11,
              marginBottom: 4,
            }}
          >
            <Icon name="info" size={11} />
            <span>cid</span>
            <AMono size={11} color={COLOR.text3} weight={400}>
              {shortAddr(metadata.cid, 10, 6)}
            </AMono>
          </div>
          {publishedAt ? (
            <div style={{ color: COLOR.text3, fontSize: 11 }}>
              published {formatPublishedAt(publishedAt)}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto", alignSelf: "center" }}>
          <RowSummary locked={locked} result={result} />
          <span style={{ color: COLOR.text3 }}>
            <Icon name="chevron-right" size={14} />
          </span>
        </div>
      </div>
    </ACard>
  );
}

function formatPublishedAt(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

function RowSummary({
  locked,
  result,
}: {
  locked: boolean;
  result: DecryptedReportLoadResult | undefined;
}) {
  if (locked) {
    return <span style={{ fontSize: 11, color: COLOR.muted }}>Locked</span>;
  }
  if (result == null) {
    return <span style={{ fontSize: 11, color: COLOR.muted }}>Decrypting…</span>;
  }
  if (result.kind === "ready") {
    const totals = summarizeDailyReport(result.report);
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <AMono size={14} color={COLOR.text}>
          {formatDailyReportTotals(totals)}
        </AMono>
        <span style={{ fontSize: 11, color: COLOR.muted }}>
          {totals.paymentCount} payment{totals.paymentCount === 1 ? "" : "s"}
        </span>
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, color: COLOR.redSoft }}>
      {result.kind === "decrypt-error" ? "Wrong passcode" : "Unreadable"}
    </span>
  );
}
