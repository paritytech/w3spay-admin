/**
 * Pure-helper tests for the Reports → Transactions stream layer.
 *
 * Covers the four pieces in `src/data/transaction-stream.ts`:
 *
 *   - `windowSinceMs` produces the expected rolling-N offset.
 *   - `datesInWindow` keeps the boundary day (partial-day rows handled
 *     downstream) and drops anything older.
 *   - `flattenReports` augments transactions with terminal info, sorts
 *     newest-first by `timestampMs`, and filters by `sinceMs`.
 *   - `summarize` aggregates per-asset Finished totals as bigint and
 *     excludes refunds from the sum while still counting them.
 *
 * Pure data only — no React, no host, no chain. Keeps the windowing
 * contract pinned so a future refactor (calendar buckets, net volume,
 * etc.) breaks tests rather than the screen.
 */

import { describe, expect, it } from "vitest";

import type {
  DailyReport,
  DailyReportTransaction,
} from "@features/reports/daily-report.ts";
import {
  datesInWindow,
  flattenReports,
  summarize,
  windowDurationMs,
  windowSinceMs,
  type TerminalRef,
} from "@features/reports/transaction-stream.ts";

// ── Fixtures ────────────────────────────────────────────────────

const TERMINAL_A: TerminalRef = {
  key: "0xaaaa",
  name: "Café Marais",
  terminalId: "t3r-aaaa",
};

const TERMINAL_B: TerminalRef = {
  key: "0xbbbb",
  name: "Burgersmith",
  terminalId: "t3r-bbbb",
};

const NOW = Date.UTC(2026, 4, 26, 12, 0, 0); // 2026-05-26T12:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000;

function txAt(
  saleId: string,
  timestampMs: number,
  overrides: Partial<DailyReportTransaction> = {},
): DailyReportTransaction {
  return {
    saleId,
    status: "Finished",
    amount: "1000",
    amountFormatted: "1.00",
    asset: "CASH",
    evmMerchant: "0x0000000000000000000000000000000000000001",
    evmCustomer: "0x0000000000000000000000000000000000000002",
    txHash: "0xff",
    blockNumber: "1",
    timestamp: String(timestampMs),
    timestampFormatted: new Date(timestampMs).toISOString(),
    terminalId: "t3r-aaaa",
    refundOf: null,
    originalCustomer: "",
    originalMerchant: "",
    originalBlockNumber: "",
    originalBlockHash: "",
    ...overrides,
  };
}

function report(
  date: string,
  transactions: ReadonlyArray<DailyReportTransaction>,
): DailyReport {
  return {
    exportDate: `${date}T18:00:00.000Z`,
    selectedDate: date,
    network: "Paseo Asset Hub Next",
    rpcUrl: "https://example",
    totalTransactions: transactions.length,
    dayFinalized: true,
    transactions,
  };
}

// ── windowSinceMs / windowDurationMs ────────────────────────────

describe("windowSinceMs", () => {
  it("rolls back by the expected duration", () => {
    expect(windowSinceMs("24h", NOW)).toBe(NOW - DAY_MS);
    expect(windowSinceMs("7d", NOW)).toBe(NOW - 7 * DAY_MS);
    expect(windowSinceMs("30d", NOW)).toBe(NOW - 30 * DAY_MS);
  });

  it("windowDurationMs returns the same offset as windowSinceMs", () => {
    expect(windowDurationMs("24h")).toBe(DAY_MS);
    expect(windowDurationMs("7d")).toBe(7 * DAY_MS);
    expect(windowDurationMs("30d")).toBe(30 * DAY_MS);
  });
});

// ── datesInWindow ────────────────────────────────────────────────

describe("datesInWindow", () => {
  const dates = [
    "2026-05-26",
    "2026-05-25",
    "2026-05-24",
    "2026-05-19",
    "2026-05-18",
    "2026-04-26",
    "2026-04-25",
  ];

  it("24h window keeps today and the boundary day, drops older", () => {
    // since = 2026-05-25T12Z → boundary day = 2026-05-25.
    expect(datesInWindow(dates, "24h", NOW)).toEqual([
      "2026-05-26",
      "2026-05-25",
    ]);
  });

  it("7d window keeps the boundary day at the edge", () => {
    // since = 2026-05-19T12Z → boundary day = 2026-05-19 stays.
    expect(datesInWindow(dates, "7d", NOW)).toEqual([
      "2026-05-26",
      "2026-05-25",
      "2026-05-24",
      "2026-05-19",
    ]);
  });

  it("30d window keeps the boundary day exactly at the edge", () => {
    // since = 2026-04-26T12Z → boundary day = 2026-04-26 stays, 04-25 drops.
    expect(datesInWindow(dates, "30d", NOW)).toEqual([
      "2026-05-26",
      "2026-05-25",
      "2026-05-24",
      "2026-05-19",
      "2026-05-18",
      "2026-04-26",
    ]);
  });

  it("ignores non-string entries defensively", () => {
    const polluted = [
      "2026-05-26",
      null as unknown as string,
      "2026-05-25",
    ];
    expect(datesInWindow(polluted, "24h", NOW)).toEqual([
      "2026-05-26",
      "2026-05-25",
    ]);
  });
});

// ── flattenReports ───────────────────────────────────────────────

describe("flattenReports", () => {
  const dayToday = report("2026-05-26", [
    txAt("sale-late", NOW - 60_000),
    txAt("sale-noon", NOW - 30 * 60_000),
  ]);
  const dayYesterday = report("2026-05-25", [
    txAt("sale-yesterday-late", NOW - DAY_MS - 60_000),
    // Boundary-day partial: older than `sinceMs` for the 24h window.
    txAt("sale-yesterday-early", NOW - DAY_MS - 90 * 60_000),
  ]);
  const dayThreeAgo = report("2026-05-23", [
    txAt("sale-old", NOW - 3 * DAY_MS),
  ]);

  it("returns an empty list when there are no reports", () => {
    expect(flattenReports([], NOW)).toEqual([]);
  });

  it("sorts desc by timestampMs and tags each entry with its terminal", () => {
    const flattened = flattenReports(
      [
        { terminal: TERMINAL_A, date: "2026-05-26", report: dayToday },
        { terminal: TERMINAL_B, date: "2026-05-25", report: dayYesterday },
      ],
      0, // no since filter
    );
    expect(flattened.map((s) => s.tx.saleId)).toEqual([
      "sale-late",
      "sale-noon",
      "sale-yesterday-late",
      "sale-yesterday-early",
    ]);
    expect(flattened[0]?.terminal).toBe(TERMINAL_A);
    expect(flattened[2]?.terminal).toBe(TERMINAL_B);
    expect(flattened[0]?.dateBucket).toBe("2026-05-26");
    expect(flattened[2]?.dateBucket).toBe("2026-05-25");
  });

  it("filters out transactions older than sinceMs", () => {
    const sinceMs = windowSinceMs("24h", NOW);
    const flattened = flattenReports(
      [
        { terminal: TERMINAL_A, date: "2026-05-26", report: dayToday },
        { terminal: TERMINAL_A, date: "2026-05-25", report: dayYesterday },
        { terminal: TERMINAL_A, date: "2026-05-23", report: dayThreeAgo },
      ],
      sinceMs,
    );
    expect(flattened.map((s) => s.tx.saleId)).toEqual([
      "sale-late",
      "sale-noon",
    ]);
  });

  it("keeps rows with unparseable timestamps and sorts them last", () => {
    const broken = report("2026-05-26", [
      txAt("sale-broken", 0, { timestamp: "not-a-number" }),
      txAt("sale-ok", NOW - 120_000),
    ]);
    const flattened = flattenReports(
      [{ terminal: TERMINAL_A, date: "2026-05-26", report: broken }],
      0,
    );
    expect(flattened.map((s) => s.tx.saleId)).toEqual([
      "sale-ok",
      "sale-broken",
    ]);
    expect(flattened[1]?.timestampMs).toBe(0);
  });
});

// ── summarize ────────────────────────────────────────────────────

describe("summarize", () => {
  it("counts every tx and sums Finished by asset using amountFormatted", () => {
    const stream = flattenReports(
      [
        {
          terminal: TERMINAL_A,
          date: "2026-05-26",
          report: report("2026-05-26", [
            txAt("a1", NOW - 1, { amount: "1500", amountFormatted: "1.50" }),
            txAt("a2", NOW - 2, { amount: "2500", amountFormatted: "2.50" }),
            txAt("a3", NOW - 3, {
              amount: "100",
              amountFormatted: "1.00",
              asset: "USD",
            }),
          ]),
        },
      ],
      0,
    );
    const result = summarize(stream);
    expect(result.count).toBe(3);
    expect(result.finishedByAsset.get("CASH")).toEqual({ amount: 4, count: 2 });
    expect(result.finishedByAsset.get("USD")).toEqual({ amount: 1, count: 1 });
  });

  it("excludes refunds from per-asset totals but still counts them", () => {
    const stream = flattenReports(
      [
        {
          terminal: TERMINAL_A,
          date: "2026-05-26",
          report: report("2026-05-26", [
            txAt("a1", NOW - 1, { amountFormatted: "1.00" }),
            txAt("r1", NOW - 2, {
              status: "Refunded",
              amountFormatted: "1.00",
              refundOf: "a1",
            }),
          ]),
        },
      ],
      0,
    );
    const result = summarize(stream);
    expect(result.count).toBe(2);
    expect(result.finishedByAsset.get("CASH")).toEqual({ amount: 1, count: 1 });
  });

  it("ignores non-numeric amountFormatted strings without crashing", () => {
    const stream = flattenReports(
      [
        {
          terminal: TERMINAL_A,
          date: "2026-05-26",
          report: report("2026-05-26", [
            txAt("a1", NOW - 1, { amountFormatted: "abc" }),
            txAt("a2", NOW - 2, { amountFormatted: "10" }),
            txAt("a3", NOW - 3, { amountFormatted: "" }),
            // Producer never emits thousands separators — reject them.
            txAt("a4", NOW - 4, { amountFormatted: "1,000.00" }),
          ]),
        },
      ],
      0,
    );
    const result = summarize(stream);
    expect(result.count).toBe(4);
    expect(result.finishedByAsset.get("CASH")).toEqual({ amount: 10, count: 1 });
  });
});
