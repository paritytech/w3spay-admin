// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useMemo, useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { envConfig } from "@/config";
import { resolveNetwork } from "@shared/chain/host";
import {
  useAllTerminalReportIndices,
  type TerminalReportIndex,
} from "@features/reports/contracts/report-index-queries.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import { useT3rminalAssignments } from "@shared/store/use-assignments-store.ts";
import type { TransactionsStreamTerminal } from "@features/reports/transaction-stream.ts";
import { ACard, AHead } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { SegmentedChips } from "@features/reports/components/SegmentedChips.tsx";
import { TerminalsList } from "@features/reports/components/TerminalsList.tsx";
import { TransactionsView } from "@features/reports/components/TransactionsView.tsx";
import { ProcessorGroupsList } from "@features/reports/components/ProcessorGroupsList.tsx";

type TopViewId = "transactions" | "days" | "processors";

const TOP_VIEWS = [
  { id: "transactions" as const, label: "Transactions" },
  { id: "days" as const, label: "Daily reports" },
  { id: "processors" as const, label: "Processors" },
];

export function Reports() {
  const { merchants } = useMerchants();
  const { assignments } = useT3rminalAssignments();

  const terminals = useMemo(
    () => merchants.filter((m): m is AdminMerchant => m.kind === "t3rminal"),
    [merchants],
  );
  const shopKeys = useMemo(
    () => terminals.map((m) => m.key.toLowerCase() as `0x${string}`),
    [terminals],
  );

  const aggregate = useAllTerminalReportIndices(shopKeys);

  const [view, setView] = useState<TopViewId>("transactions");

  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;

  const streamTerminals = useMemo<ReadonlyArray<TransactionsStreamTerminal>>(
    () => buildStreamTerminals(terminals, aggregate.indices, assignments),
    [terminals, aggregate.indices, assignments],
  );

  return (
    <>
      <AHead eyebrow="Reports" title="Reports" size={32} />

      <div style={{ marginBottom: 14 }}>
        <SegmentedChips value={view} items={TOP_VIEWS} onChange={setView} />
      </div>

      {view === "processors" ? (
        // Processor reports come from the registry contract, not the t3rminal
        // bulletin index — a t3rminal-index misconfig must not hide them.
        <ProcessorGroupsList />
      ) : aggregate.state === "config-error" ? (
        <div style={{ marginBottom: 12 }}>
          <ACard padding={14}>
            <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
              Reports index isn't configured: {aggregate.reason}. Set
              <code style={{ margin: "0 4px", color: COLOR.text2 }}>
                VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS
              </code>
              in <code style={{ color: COLOR.text2 }}>.env.local</code> and reload.
            </div>
          </ACard>
        </div>
      ) : view === "transactions" ? (
        <TransactionsView
          terminals={streamTerminals}
          hideTerminalColumn={false}
          gatewayBase={gatewayBase}
          indexReady={aggregate.state === "ready"}
        />
      ) : (
        <TerminalsList
          terminals={terminals}
          indices={aggregate.indices}
          assignments={assignments}
          indexState={aggregate.state}
        />
      )}
    </>
  );
}

function buildStreamTerminals(
  terminals: ReadonlyArray<AdminMerchant>,
  indices: ReadonlyMap<`0x${string}`, TerminalReportIndex | null>,
  assignments: ReadonlyMap<string, { reportPassword: string }>,
): ReadonlyArray<TransactionsStreamTerminal> {
  const out: TransactionsStreamTerminal[] = [];
  for (const m of terminals) {
    const shopKey = m.key.toLowerCase() as `0x${string}`;
    const index = indices.get(shopKey);
    const entries = index?.entries ?? [];
    out.push({
      terminal: {
        key: m.key,
        name: m.name,
        terminalId: m.terminalId,
      },
      shopKey,
      reportPassword: assignments.get(m.key)?.reportPassword ?? null,
      entries,
    });
  }
  return out;
}
