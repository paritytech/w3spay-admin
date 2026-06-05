/**
 * Extracted terminals-list body shown in the Reports → Daily reports
 * segment. Lives in its own file so `Reports.tsx` is just the view
 * toggle + segment dispatch, not the per-terminal orchestration.
 *
 * Behaviour is the original `Reports` body: each row links into the
 * per-terminal drill-in, with a "no QR" warning on terminals that
 * haven't been issued a password yet.
 */

import { type AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { T3rminalAssignmentV1 } from "@shared/store/t3rminal-assignments.ts";
import { useNavigate } from "@tanstack/react-router";
import type {
  TerminalReportIndex,
} from "@features/reports/api/bulletin-index-read.ts";
import { ACard } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { ReportTerminalRow } from "./ReportTerminalRow.tsx";

export interface TerminalsListProps {
  readonly terminals: ReadonlyArray<AdminMerchant>;
  readonly indices: ReadonlyMap<`0x${string}`, TerminalReportIndex | null>;
  readonly assignments: ReadonlyMap<string, T3rminalAssignmentV1>;
  readonly indexState: "idle" | "loading" | "ready" | "config-error";
}

export function TerminalsList({
  terminals,
  indices,
  assignments,
  indexState,
}: TerminalsListProps) {
  const navigate = useNavigate();

  if (terminals.length === 0) {
    return (
      <ACard padding={20}>
        <div style={{ color: COLOR.text2, fontSize: 13, lineHeight: 1.55 }}>
          Register a T3rminal merchant from the Merchants tab to start
          seeing daily reports.
        </div>
      </ACard>
    );
  }

  const sorted = sortTerminals(terminals, indices);
  const totalReports = sumReports(indices);

  return (
    <>
      {totalReports === 0 && indexState === "ready" ? (
        <div style={{ marginBottom: 12 }}>
          <ACard padding={14}>
            <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.55 }}>
              No daily reports uploaded yet. T3rminal devices encrypt
              end-of-day reports and pin them to Bulletin Chain — once a
              device finalizes its first day the entry appears here. If
              your devices have already finalized days, they may still
              be writing under the legacy URL-host key scheme; the next
              T3rminal build re-indexes them under the registry terminal
              key the admin reads from.
            </div>
          </ACard>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((m) => {
          const key = m.key.toLowerCase() as `0x${string}`;
          const index = indices.get(key) ?? null;
          const hasAssignment = assignments.has(m.key);
          return (
            <ReportTerminalRow
              key={m.key}
              m={m}
              index={index}
              hasAssignment={hasAssignment}
              onClick={() =>
                navigate({ to: "/reports/$merchantKey", params: { merchantKey: m.key } })
              }
            />
          );
        })}
      </div>

      {indexState === "loading" && totalReports === 0 ? (
        <div
          style={{
            marginTop: 12,
            color: COLOR.muted,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Reading the report index…
        </div>
      ) : null}
    </>
  );
}

/**
 * Terminals with reports first (newest most-recent date), then ones
 * without. Inside the "no reports" bucket, alphabetical by name.
 */
function sortTerminals(
  terminals: ReadonlyArray<AdminMerchant>,
  indices: ReadonlyMap<`0x${string}`, TerminalReportIndex | null>,
): ReadonlyArray<AdminMerchant> {
  const copy = [...terminals];
  copy.sort((a, b) => {
    const ia = indices.get(a.key.toLowerCase() as `0x${string}`);
    const ib = indices.get(b.key.toLowerCase() as `0x${string}`);
    const lastA = ia?.entries[0]?.date ?? "";
    const lastB = ib?.entries[0]?.date ?? "";
    if (lastA && !lastB) return -1;
    if (!lastA && lastB) return 1;
    if (lastA && lastB && lastA !== lastB) return lastB.localeCompare(lastA);
    return a.name.localeCompare(b.name);
  });
  return copy;
}

function sumReports(
  indices: ReadonlyMap<`0x${string}`, TerminalReportIndex | null>,
): number {
  let total = 0;
  for (const v of indices.values()) total += v?.count ?? 0;
  return total;
}
