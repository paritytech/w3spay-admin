/**
 * Inline expansion below a {@link TransactionRow}. Surfaces the
 * customer/merchant addresses, the on-chain tx hash with copy, the
 * itemised sale lines if present, and a refund pointer when applicable.
 *
 * Visual structure mirrors `TransactionCard` in `ReportDetailPanel` for
 * consistency, with the date / terminal context dropped (the row above
 * already carries them) and the txHash promoted to a copyable line.
 */

import { useCallback } from "react";

import type { StreamTransaction } from "@features/reports/transaction-stream.ts";
import { shortAddr } from "@features/merchant/merchant-model.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { AEye, AMono } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface TransactionDetailInlineProps {
  readonly entry: StreamTransaction;
  /** Pass `true` from per-terminal views to suppress the terminal label. */
  readonly hideTerminalColumn: boolean;
}

export function TransactionDetailInline({
  entry,
  hideTerminalColumn,
}: TransactionDetailInlineProps) {
  const { tx, terminal, dateBucket } = entry;
  const copyValue = useFeedbackStore((s) => s.copyValue);

  const copyHash = useCallback(() => {
    if (typeof tx.txHash !== "string" || tx.txHash.length === 0) return;
    copyValue(tx.txHash, "tx-hash");
  }, [tx.txHash, copyValue]);

  return (
    <div
      style={{
        marginTop: 6,
        padding: 12,
        background: COLOR.surface2,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 10,
      }}
    >
      <AEye>Sale {shortAddr(tx.saleId, 10, 8)}</AEye>

      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "6px 12px",
          fontSize: 12,
        }}
      >
        {!hideTerminalColumn ? (
          <>
            <span style={{ color: COLOR.muted }}>Terminal</span>
            <span style={{ color: COLOR.text2 }}>
              {terminal.name}
              <span style={{ color: COLOR.text3, marginLeft: 6 }}>· {terminal.terminalId}</span>
            </span>
          </>
        ) : null}

        <span style={{ color: COLOR.muted }}>Date</span>
        <span style={{ color: COLOR.text2 }}>
          {tx.timestampFormatted || dateBucket}
        </span>

        <span style={{ color: COLOR.muted }}>Customer</span>
        <AMono size={12} color={COLOR.text2} weight={400}>
          {shortAddr(tx.evmCustomer, 10, 8)}
        </AMono>

        <span style={{ color: COLOR.muted }}>Merchant</span>
        <AMono size={12} color={COLOR.text2} weight={400}>
          {shortAddr(tx.evmMerchant, 10, 8)}
        </AMono>

        <span style={{ color: COLOR.muted }}>Tx hash</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AMono size={12} color={COLOR.text2} weight={400}>
            {shortAddr(tx.txHash, 12, 8)}
          </AMono>
          <button
            type="button"
            onClick={copyHash}
            title="Copy full tx hash"
            style={{
              background: "transparent",
              color: COLOR.text3,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 8,
              padding: "2px 6px",
              cursor: "pointer",
              fontSize: 11,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "inherit",
            }}
          >
            <Icon name="copy" size={11} />
            Copy
          </button>
        </span>

        {typeof tx.refundOf === "string" && tx.refundOf.length > 0 ? (
          <>
            <span style={{ color: COLOR.muted }}>Refund of</span>
            <AMono size={12} color={COLOR.amberSoft} weight={400}>
              {shortAddr(tx.refundOf, 12, 8)}
            </AMono>
          </>
        ) : null}
      </div>

      {tx.items && tx.items.length > 0 ? (
        <>
          <div style={{ height: 10 }} />
          <AEye>Items</AEye>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
            {tx.items.map((item, idx) => (
              <div
                key={`${item.name}-${idx}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: COLOR.text3,
                  padding: "2px 0",
                  fontFamily: FONT.sans,
                }}
              >
                <span>
                  {item.quantity} × {item.name}
                </span>
                <AMono size={12} color={COLOR.text3} weight={400}>
                  {item.unitPrice}
                </AMono>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
