// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useMemo, useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import {
  useAllTerminalReportIndices,
  type TerminalReportRef,
} from "@features/reports/contracts/report-index-queries.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import { useT3rminalAssignments } from "@shared/store/use-assignments-store.ts";
import { ACard, AHead } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { SegmentedChips } from "@features/reports/components/SegmentedChips.tsx";
import { TerminalsList } from "@features/reports/components/TerminalsList.tsx";
import { ProcessorGroupsList } from "@features/reports/components/ProcessorGroupsList.tsx";

type TopViewId = "processors" | "terminals";

const TOP_VIEWS = [
  { id: "processors" as const, label: "Payment Processor Reports" },
  { id: "terminals" as const, label: "T3rminal Reports" },
];

export function Reports() {
  const { merchants } = useMerchants();
  const { assignments } = useT3rminalAssignments();

  const terminals = useMemo(
    () => merchants.filter((m): m is AdminMerchant => m.kind === "t3rminal"),
    [merchants],
  );
  const refs = useMemo<ReadonlyArray<TerminalReportRef>>(
    () =>
      terminals.map((m) => ({
        shopKey: m.key.toLowerCase() as `0x${string}`,
        merchantId: m.merchantId,
        terminalId: m.terminalId,
      })),
    [terminals],
  );

  const aggregate = useAllTerminalReportIndices(refs);

  const [view, setView] = useState<TopViewId>("processors");

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
