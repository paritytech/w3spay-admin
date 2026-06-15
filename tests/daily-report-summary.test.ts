import { describe, expect, it } from "vitest";

import {
  formatDailyReportTotals,
  summarizeDailyReport,
  type DailyReport,
  type DailyReportTransaction,
} from "@features/reports/daily-report.ts";

function makeTx(overrides: Partial<DailyReportTransaction> = {}): DailyReportTransaction {
  return {
    saleId: "s1",
    status: "Finished",
    amount: "1000",
    amountFormatted: "1.00",
    asset: "CASH",
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

describe("summarizeDailyReport", () => {
  it("sums Finished amounts per asset and counts only completed payments", () => {
    const totals = summarizeDailyReport(
      makeReport([
        makeTx({ amountFormatted: "2.50" }),
        makeTx({ saleId: "s2", amountFormatted: "1.25" }),
        makeTx({ saleId: "s3", status: "Refunded", amountFormatted: "1.00" }),
      ]),
    );
    expect(totals.paymentCount).toBe(2);
    expect(totals.totalsByAsset).toEqual([{ asset: "CASH", total: 3.75 }]);
  });

  it("groups multiple assets and sorts by total descending", () => {
    const totals = summarizeDailyReport(
      makeReport([
        makeTx({ asset: "EUR", amountFormatted: "5.00" }),
        makeTx({ saleId: "s2", asset: "CASH", amountFormatted: "10.00" }),
        makeTx({ saleId: "s3", asset: "EUR", amountFormatted: "1.00" }),
      ]),
    );
    expect(totals.paymentCount).toBe(3);
    expect(totals.totalsByAsset).toEqual([
      { asset: "CASH", total: 10 },
      { asset: "EUR", total: 6 },
    ]);
  });

  it("counts a non-numeric amount as a payment but skips it from the sum", () => {
    const totals = summarizeDailyReport(
      makeReport([
        makeTx({ amountFormatted: "n/a" }),
        makeTx({ saleId: "s2", amountFormatted: "4.00" }),
      ]),
    );
    expect(totals.paymentCount).toBe(2);
    expect(totals.totalsByAsset).toEqual([{ asset: "CASH", total: 4 }]);
  });
});

describe("formatDailyReportTotals", () => {
  it("renders a single asset with two decimals and the symbol", () => {
    const totals = summarizeDailyReport(makeReport([makeTx({ amountFormatted: "12.5" })]));
    expect(formatDailyReportTotals(totals)).toBe("12.50 CASH");
  });

  it("joins multiple assets with a separator", () => {
    const totals = summarizeDailyReport(
      makeReport([
        makeTx({ asset: "CASH", amountFormatted: "10.00" }),
        makeTx({ saleId: "s2", asset: "EUR", amountFormatted: "3.00" }),
      ]),
    );
    expect(formatDailyReportTotals(totals)).toBe("10.00 CASH · 3.00 EUR");
  });

  it("falls back to an em dash when nothing completed", () => {
    expect(formatDailyReportTotals(summarizeDailyReport(makeReport([])))).toBe("—");
  });
});
