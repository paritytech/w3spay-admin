// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { shortAddr, formatIsoDateTime } from "@features/merchant/merchant-model.ts";
import { ACard, AHead, AMono, APrimary, ASecondary } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

import { processorConfigRegistryQueryOptions } from "../contracts/processor-config-queries.ts";
import { useMergedRemoteConfigExport, type MergedRemoteConfigExportApi } from "../use-merged-remote-config-export.ts";
import { ConfigEditor } from "../components/ConfigEditor.tsx";
import { ConfigListSkeleton } from "../components/ConfigListSkeleton.tsx";
import { ExportPanel } from "../components/ExportPanel.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";

export type PaymentProcessorsView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "edit"; groupId: string };

export function PaymentProcessors({ view }: { view: PaymentProcessorsView }) {
  if (view.kind === "list") return <ConfigList />;
  return <ConfigEditor initialGroupId={view.kind === "edit" ? view.groupId : null} />;
}

function ConfigList() {
  const navigate = useNavigate();
  const query = useQuery(processorConfigRegistryQueryOptions());
  const rows = query.data ?? [];
  const exporter = useMergedRemoteConfigExport();

  return (
    <>
      <AHead eyebrow="Directory" title="Payment processors" size={32} />
      <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.5, marginBottom: 12 }}>
        Configs for <strong style={{ color: COLOR.text }}>external merchants who accept coin payments</strong> through
        their own payment-processor app (a Square-style till, not a T3rminal device). Each config bundles a
        merchant profile + its POS terminals + the keys their payer apps encrypt to; it's published to
        Bulletin and indexed on the registry by groupId.
      </div>

      {query.isLoading && rows.length === 0 ? (
        <ConfigListSkeleton />
      ) : rows.length === 0 ? (
        <ACard padding={18}>
          <div style={{ fontSize: 13, color: COLOR.muted, lineHeight: 1.5 }}>
            No payment-processor configs published yet.
          </div>
        </ACard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => (
            <ACard
              key={row.groupId}
              onClick={() => navigate({ to: "/payment-processors/$groupId", params: { groupId: row.groupId } })}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <ExportSelectToggle groupId={row.groupId} exporter={exporter} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontFamily: FONT.serif, fontSize: 16, color: COLOR.text }}>{row.groupId}</div>
                    <div style={{ fontSize: 11, color: COLOR.faint }}>{formatIsoDateTime(row.updatedAt)}</div>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 12, alignItems: "center" }}>
                    <AMono size={11} color={COLOR.text2}>{shortAddr(row.cid, 10, 8)}</AMono>
                    <span style={{ fontSize: 11, color: COLOR.faint }}>{row.size} bytes</span>
                    {exporter.selected.has(row.groupId) && !exporter.isExportable(row.groupId) ? (
                      <span style={{ fontSize: 11, color: COLOR.amberSoft }}>not unlocked on this device</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </ACard>
          ))}
        </div>
      )}

      {rows.length > 0 ? <MergedExportSection exporter={exporter} /> : null}

      <div style={{ height: 14 }} />
      <APrimary onClick={() => navigate({ to: "/payment-processors/new" })}>
        <Icon name="plus" size={14} /> New configuration
      </APrimary>
    </>
  );
}

function ExportSelectToggle({
  groupId,
  exporter,
}: {
  groupId: string;
  exporter: MergedRemoteConfigExportApi;
}) {
  const selected = exporter.selected.has(groupId);
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    exporter.toggle(groupId);
  };
  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={`Include ${groupId} in remote-config export`}
      onClick={onClick}
      style={{
        width: 18,
        height: 18,
        marginTop: 2,
        flexShrink: 0,
        borderRadius: 5,
        border: `1px solid ${selected ? COLOR.blue : COLOR.border2}`,
        background: selected ? "rgba(96,165,250,0.15)" : "transparent",
        color: COLOR.blue,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected ? <Icon name="check" size={12} /> : null}
    </div>
  );
}

function MergedExportSection({ exporter }: { exporter: MergedRemoteConfigExportApi }) {
  const count = exporter.selected.size;
  return (
    <>
      <div style={{ height: 14 }} />
      <ASecondary onClick={exporter.onExport} disabled={count === 0}>
        Export remote config{count > 0 ? ` (${count} selected)` : ""}
      </ASecondary>
      <div style={{ fontSize: 11, color: COLOR.faint, lineHeight: 1.5, marginTop: 6 }}>
        Tick one or more configs to merge into a single payer-app remote config. A terminalId mapped
        by two configs aborts the export until resolved. Only configs published or unlocked on this
        device can be exported.
      </div>
      {exporter.error ? <ErrorBox message={exporter.error} /> : null}
      {exporter.exportJson ? (
        <ExportPanel json={exporter.exportJson} fileName={exporter.exportFileName} />
      ) : null}
    </>
  );
}