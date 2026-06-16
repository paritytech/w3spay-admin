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

const HEADER =
  "Sale ID,Timestamp,Timestamp Formatted,Status,Item,Quantity,Unit Price,Line Total,Asset,Merchant,Customer,Tx Hash,Block Number";

describe("dailyReportToCsv", () => {
  it("emits the canonical header and an (amount only) row when a sale has no items", () => {
    const csv = dailyReportToCsv(
      makeReport([makeTx({ amountFormatted: "9.00", asset: "CASH" })]),
    );
    const [header, ...rows] = csv.split("\n");
    expect(header).toBe(HEADER);
    expect(rows).toHaveLength(1);
    // raw millis Timestamp + verbatim ISO Timestamp Formatted, item line synthesised.
    expect(rows[0]).toBe(
      "s1,1000,whenever,Finished,(amount only),1,9.00,9.00,CASH,0xmerchant,0xcustomer,0xhash,42",
    );
  });

  it("explodes each item into its own row with unitPrice × quantity line totals", () => {
    const csv = dailyReportToCsv(
      makeReport([
        makeTx({
          asset: "CASH",
          items: [
            { name: "Pierogi (8 Stück)", quantity: 1, unitPrice: "9.00" },
            { name: "Linsensuppe", quantity: 2, unitPrice: "6.00" },
          ],
        }),
      ]),
    );
    const rows = csv.split("\n").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(
      "s1,1000,whenever,Finished,Pierogi (8 Stück),1,9.00,9.00,CASH,0xmerchant,0xcustomer,0xhash,42",
    );
    expect(rows[1]).toBe(
      "s1,1000,whenever,Finished,Linsensuppe,2,6.00,12.00,CASH,0xmerchant,0xcustomer,0xhash,42",
    );
  });

  it("quotes cells with commas/quotes (RFC 4180)", () => {
    const csv = dailyReportToCsv(
      makeReport([makeTx({ items: [{ name: 'Beans, "extra"', quantity: 1, unitPrice: "1.00" }] })]),
    );
    expect(csv.split("\n")[1]!).toContain('"Beans, ""extra"""');
  });

  it("prefers original merchant/customer, falling back to the evm fields", () => {
    const csv = dailyReportToCsv(
      makeReport([makeTx({ originalMerchant: "5DfXxr", originalCustomer: "anonymous" })]),
    );
    const cells = csv.split("\n")[1]!.split(",");
    expect(cells[9]).toBe("5DfXxr");
    expect(cells[10]).toBe("anonymous");
  });

  it("leaves the line total empty when the unit price isn't numeric", () => {
    const csv = dailyReportToCsv(
      makeReport([makeTx({ items: [{ name: "Mystery", quantity: 3, unitPrice: "n/a" }] })]),
    );
    const cells = csv.split("\n")[1]!.split(",");
    expect(cells[6]).toBe("n/a"); // unit price kept verbatim
    expect(cells[7]).toBe(""); // line total empty
  });

  it("returns a header-only document when there are no transactions", () => {
    expect(dailyReportToCsv(makeReport([]))).toBe(HEADER);
  });
});
