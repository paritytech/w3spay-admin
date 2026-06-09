// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { shortAddr, formatIsoDateTime } from "@features/merchant/merchant-model.ts";
import { ACard, AHead, AMono, APrimary } from "@shared/components/primitives.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

import { processorConfigRegistryQueryOptions } from "../contracts/processor-config-queries.ts";
import { ConfigEditor } from "../components/ConfigEditor.tsx";
import { ConfigListSkeleton } from "../components/ConfigListSkeleton.tsx";

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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontFamily: FONT.serif, fontSize: 16, color: COLOR.text }}>{row.groupId}</div>
                <div style={{ fontSize: 11, color: COLOR.faint }}>{formatIsoDateTime(row.updatedAt)}</div>
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 12, alignItems: "center" }}>
                <AMono size={11} color={COLOR.text2}>{shortAddr(row.cid, 10, 8)}</AMono>
                <span style={{ fontSize: 11, color: COLOR.faint }}>{row.size} bytes</span>
              </div>
            </ACard>
          ))}
        </div>
      )}

      <div style={{ height: 14 }} />
      <APrimary onClick={() => navigate({ to: "/payment-processors/new" })}>
        <Icon name="plus" size={14} /> New configuration
      </APrimary>
    </>
  );
}
