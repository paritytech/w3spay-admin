/**
 * Single terminal row in the top-level Reports list.
 *
 * Renders merchant name + terminal snippet + a small data triad:
 * report count, most recent date, assignment-readiness flag (red when
 * the admin has no QR-issued password on file — the row will still load
 * the chain index but won't be able to decrypt anything).
 */

import { type AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { TerminalReportIndex } from "@features/reports/contracts/bulletin-index-read.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AMono, AStatus } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface ReportTerminalRowProps {
  readonly m: AdminMerchant;
  /**
   * Resolved index for this terminal, or `null` when the lookup failed
   * for this row (other rows may still have loaded). `undefined` is
   * never passed in — pre-load state lives on the parent.
   */
  readonly index: TerminalReportIndex | null;
  readonly hasAssignment: boolean;
  readonly onClick: () => void;
}

export function ReportTerminalRow({ m, index, hasAssignment, onClick }: ReportTerminalRowProps) {
  const lastDate = index?.entries[0]?.date ?? null;
  const count = index?.count ?? 0;
  const failed = index === null;

  return (
    <ACard onClick={onClick} padding={14}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: 18,
                letterSpacing: "-0.02em",
                color: COLOR.text,
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {m.name}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: COLOR.muted,
              fontSize: 11,
              marginBottom: 6,
            }}
          >
            <Icon name="qr-code" size={11} />
            <AMono size={11} color={COLOR.text3} weight={400}>
              {`t3r-…${m.terminalId.slice(-6)}`}
            </AMono>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: COLOR.text3, fontSize: 11 }}>
            <span>
              {failed
                ? "Couldn't load"
                : count === 0
                  ? "No saved reports yet"
                  : `${count} saved report${count === 1 ? "" : "s"}`}
            </span>
            {lastDate ? (
              <>
                <span style={{ color: COLOR.faint }}>·</span>
                <AMono size={11} color={COLOR.text3} weight={400}>
                  most recent {lastDate}
                </AMono>
              </>
            ) : null}
          </div>
          {!hasAssignment ? (
            <div style={{ marginTop: 6, fontSize: 10.5, color: COLOR.amberSoft }}>
              No QR issued — reports can be listed but not decrypted from here.
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <AStatus status={m.status} />
        </div>
      </div>
    </ACard>
  );
}
