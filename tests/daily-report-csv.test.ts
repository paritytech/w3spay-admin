import { describe, expect, it } from "vitest";

import {
  dailyReportToCsv,
  type DailyReport,
  type DailyReportTransaction,
} from "@features/reports/daily-report.ts";

function makeTx(overrides: Partial<DailyReportTransaction> = {}): DailyReportTransaction {
  return {
    saleId: "s1",
    status: "Finished",
    amount: "1000",
    amountFormatted: "0.001",
    asset: "pUSD",
    evmMerchant: "0xmerchant",
    evmCustomer: "0xcustomer",
    txHash: "0xhash",
    blockNumber: "42",
    timestamp: "1000",
    timestampFormatted: "whenever",
    terminalId: "t1",
    refundOf: null,
    originalCustomer: "",
    originalMerchant: "",
    originalBlockNumber: "",
    originalBlockHash: "",
    ...overrides,
  };
}

function makeReport(transactions: ReadonlyArray<DailyReportTransaction>): DailyReport {
  return {
    exportDate: "2026-06-01",
    selectedDate: "2026-06-01",
    network: "paseo",
    rpcUrl: "wss://example",
    totalTransactions: transactions.length,
    dayFinalized: true,
    transactions,
  };
}

describe("dailyReportToCsv", () => {
  it("emits the header and one row per transaction with an ISO timestamp", () => {
    const csv = dailyReportToCsv(makeReport([makeTx()]));
    const [header, ...rows] = csv.split("\n");
    expect(header).toBe(
      "sale_id,status,terminal_id,asset,amount,amount_formatted,block_number,timestamp,tx_hash,evm_merchant,evm_customer,refund_of",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe(
      `s1,Finished,t1,pUSD,1000,0.001,42,${new Date(1000).toISOString()},0xhash,0xmerchant,0xcustomer,`,
    );
  });

  it("quotes cells with commas/quotes (RFC 4180) and carries refundOf for refunds", () => {
    const csv = dailyReportToCsv(
      makeReport([makeTx({ saleId: 'a,"b', status: "Refunded", refundOf: "s1" })]),
    );
    const row = csv.split("\n")[1]!;
    expect(row.startsWith('"a,""b",Refunded,t1,')).toBe(true);
    expect(row.endsWith(",s1")).toBe(true);
  });

  it("keeps an unparseable timestamp verbatim", () => {
    const csv = dailyReportToCsv(makeReport([makeTx({ timestamp: "n/a" })]));
    const cells = csv.split("\n")[1]!.split(",");
    expect(cells[7]).toBe("n/a");
  });

  it("returns a header-only document when there are no transactions", () => {
    expect(dailyReportToCsv(makeReport([]))).toBe(
      "sale_id,status,terminal_id,asset,amount,amount_formatted,block_number,timestamp,tx_hash,evm_merchant,evm_customer,refund_of",
    );
  });
});
