// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * "Processors" view on the Reports tab: every payment-processor group with a
 * published config (the group universe), each linking to its on-chain Z
 * reports. The reports themselves are encrypted — viewing requires the group
 * passkey on the group page.
 */
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { shortAddr, formatIsoDateTime } from "@features/merchant/merchant-model.ts";
import { ACard } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import {
  processorConfigRegistryConfigured,
  processorConfigRegistryQueryOptions,
} from "@features/payment-processors/contracts/processor-config-queries.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";

export function ProcessorGroupsList() {
  const navigate = useNavigate();
  const query = useQuery(processorConfigRegistryQueryOptions());
  const rows = query.data ?? [];

  if (!processorConfigRegistryConfigured() && !isDemoMode()) {
    return (
      <ACard padding={14}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
          Processor registry isn't configured. Set
          <code style={{ margin: "0 4px", color: COLOR.text2 }}>VITE_W3SPAY_REGISTRY_ADDRESS</code>
          in <code style={{ color: COLOR.text2 }}>.env.local</code> and reload.
        </div>
      </ACard>
    );
  }

  if (rows.length === 0) {
    return (
      <ACard padding={18}>
        <div style={{ fontSize: 13, color: COLOR.muted, lineHeight: 1.5 }}>
          {query.isLoading ? "Loading payment-processor groups…" : "No payment-processor groups published yet."}
        </div>
      </ACard>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row) => (
        <ACard
          key={row.groupId}
          onClick={() => navigate({ to: "/reports/processors/$groupId", params: { groupId: row.groupId } })}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontFamily: FONT.serif, fontSize: 16, color: COLOR.text }}>{row.groupId}</div>
            <div style={{ fontSize: 11, color: COLOR.faint }}>{formatIsoDateTime(row.updatedAt)}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: COLOR.faint }}>
            Config {shortAddr(row.cid, 10, 8)}
          </div>
        </ACard>
      ))}
    </div>
  );
}
