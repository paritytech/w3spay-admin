// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { csvRow } from "@shared/utils/csv.ts";

export interface DailyReportItem {
  readonly name: string;
  readonly quantity: number;
  /** Display string — producer holds pUSD-style numeric formatting upstream. */
  readonly unitPrice: string;
}

export interface DailyReportTransaction {
  readonly saleId: string;
  readonly status: "Finished" | "Refunded" | string;
  /** Smallest-unit amount string (planks / similar). */
  readonly amount: string;
  /** Human-formatted amount (already includes any decimal point). */
  readonly amountFormatted: string;
  readonly asset: string;
  readonly evmMerchant: string;
  readonly evmCustomer: string;
  readonly txHash: string;
  readonly blockNumber: string;
  /** Unix millis as a string, per the producer. */
  readonly timestamp: string;
  readonly timestampFormatted: string;
  readonly terminalId: string;
  readonly refundOf: string | null;
  readonly originalCustomer: string;
  readonly originalMerchant: string;
  readonly originalBlockNumber: string;
  readonly originalBlockHash: string;
  /** Itemised lines when the sale came through the /items flow. */
  readonly items?: ReadonlyArray<DailyReportItem>;
}

export interface DailyReport {
  readonly exportDate: string;
  readonly selectedDate: string;
  readonly network: string;
  readonly rpcUrl: string;
  readonly totalTransactions: number;
  readonly dayFinalized: boolean;
  readonly transactions: ReadonlyArray<DailyReportTransaction>;
}

/**
 * Tolerant `DailyReport` decoder. Required string/number fields are
 * checked; missing optional fields default to safe values. Returns
 * `null` if the top-level shape doesn't match — the caller surfaces
 * that as a "corrupt payload" UI state.
 *
 * The producer is a separate codebase and may diverge over time;
 * keeping this defensive prevents one stray field on chain from taking
 * down the whole Reports screen.
 */
export function parseDailyReport(raw: unknown): DailyReport | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.exportDate !== "string" ||
    typeof r.selectedDate !== "string" ||
    typeof r.network !== "string" ||
    typeof r.rpcUrl !== "string" ||
    typeof r.totalTransactions !== "number" ||
    typeof r.dayFinalized !== "boolean" ||
    !Array.isArray(r.transactions)
  ) {
    return null;
  }
  const transactions: DailyReportTransaction[] = [];
  for (const entry of r.transactions) {
    const tx = parseTransaction(entry);
    if (tx) transactions.push(tx);
  }
  return {
    exportDate: r.exportDate,
    selectedDate: r.selectedDate,
    network: r.network,
    rpcUrl: r.rpcUrl,
    totalTransactions: r.totalTransactions,
    dayFinalized: r.dayFinalized,
    transactions,
  };
}

function parseTransaction(raw: unknown): DailyReportTransaction | null {
  if (raw === null || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (
    typeof t.saleId !== "string" ||
    typeof t.status !== "string" ||
    typeof t.amount !== "string" ||
    typeof t.amountFormatted !== "string" ||
    typeof t.asset !== "string" ||
    typeof t.evmMerchant !== "string" ||
    typeof t.evmCustomer !== "string" ||
    typeof t.txHash !== "string" ||
    typeof t.blockNumber !== "string" ||
    typeof t.timestamp !== "string" ||
    typeof t.timestampFormatted !== "string" ||
    typeof t.terminalId !== "string" ||
    typeof t.originalCustomer !== "string" ||
    typeof t.originalMerchant !== "string" ||
    typeof t.originalBlockNumber !== "string" ||
    typeof t.originalBlockHash !== "string"
  ) {
    return null;
  }
  const refundOf =
    typeof t.refundOf === "string" || t.refundOf === null ? (t.refundOf as string | null) : null;
  const items = Array.isArray(t.items) ? parseItems(t.items) : undefined;
  return {
    saleId: t.saleId,
    status: t.status,
    amount: t.amount,
    amountFormatted: t.amountFormatted,
    asset: t.asset,
    evmMerchant: t.evmMerchant,
    evmCustomer: t.evmCustomer,
    txHash: t.txHash,
    blockNumber: t.blockNumber,
    timestamp: t.timestamp,
    timestampFormatted: t.timestampFormatted,
    terminalId: t.terminalId,
    refundOf,
    originalCustomer: t.originalCustomer,
    originalMerchant: t.originalMerchant,
    originalBlockNumber: t.originalBlockNumber,
    originalBlockHash: t.originalBlockHash,
    ...(items ? { items } : {}),
  };
}

function parseItems(raw: ReadonlyArray<unknown>): ReadonlyArray<DailyReportItem> | undefined {
  const out: DailyReportItem[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    if (
      typeof i.name === "string" &&
      typeof i.quantity === "number" &&
      typeof i.unitPrice === "string"
    ) {
      out.push({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Spreadsheet export — one CSV row per *item line*; sales without itemised
 * lines collapse to a single "(amount only)" row. Column-for-column identical
 * to the t3rminal producer's own export (`settings/export`, `daily-reports`)
 * so the same workbook reconciles across both apps.
 */
export function dailyReportToCsv(report: DailyReport): string {
  const header =
    "Sale ID,Timestamp,Timestamp Formatted,Status,Item,Quantity,Unit Price,Line Total,Asset,Merchant,Customer,Tx Hash,Block Number";
  const rows: string[] = [];
  for (const tx of report.transactions) {
    const merchant = tx.originalMerchant || tx.evmMerchant;
    const customer = tx.originalCustomer || tx.evmCustomer;
    const lines =
      tx.items && tx.items.length > 0
        ? tx.items.map((item) => ({
            name: item.name,
            quantity: String(item.quantity),
            unitPrice: money2(item.unitPrice),
            lineTotal: lineTotalOf(item.unitPrice, item.quantity),
          }))
        : [
            {
              name: "(amount only)",
              quantity: "1",
              unitPrice: money2(tx.amountFormatted),
              lineTotal: money2(tx.amountFormatted),
            },
          ];
    for (const line of lines) {
      rows.push(
        csvRow([
          tx.saleId,
          tx.timestamp,
          tx.timestampFormatted,
          tx.status,
          line.name,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
          tx.asset,
          merchant,
          customer,
          tx.txHash,
          tx.blockNumber,
        ]),
      );
    }
  }
  return [header, ...rows].join("\n");
}

/** Mirror the producer's money formatting: 2 decimals, original string when NaN. */
function money2(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : amount;
}

/** unitPrice × quantity to 2 decimals; empty when the price isn't numeric. */
function lineTotalOf(unitPrice: string, quantity: number): string {
  const n = Number(unitPrice);
  return Number.isFinite(n) ? (n * quantity).toFixed(2) : "";
}

export interface DailyReportAssetTotal {
  readonly asset: string;
  /** Summed Finished amount in display units. */
  readonly total: number;
}

export interface DailyReportTotals {
  /** Count of completed (Finished) payments — refunds excluded. */
  readonly paymentCount: number;
  /** Finished amount summed per asset symbol, largest first. */
  readonly totalsByAsset: ReadonlyArray<DailyReportAssetTotal>;
}

/**
 * Roll a day's transactions up to the headline figures shown on the saved-day
 * card: how many payments completed and how much was taken per asset. Only
 * `Finished` rows count (refunds are neither a payment nor cash taken); a
 * non-numeric `amountFormatted` is skipped rather than poisoning the sum.
 */
export function summarizeDailyReport(report: DailyReport): DailyReportTotals {
  const totals = new Map<string, number>();
  let paymentCount = 0;
  for (const tx of report.transactions) {
    if (tx.status !== "Finished") continue;
    paymentCount += 1;
    const amount = Number(tx.amountFormatted);
    if (!Number.isFinite(amount)) continue;
    totals.set(tx.asset, (totals.get(tx.asset) ?? 0) + amount);
  }
  const totalsByAsset = [...totals.entries()]
    .map(([asset, total]) => ({ asset, total }))
    .sort((a, b) => b.total - a.total);
  return { paymentCount, totalsByAsset };
}

/** Render per-asset totals as a compact `12.50 CASH · 3.00 EUR` string. */
export function formatDailyReportTotals(totals: DailyReportTotals): string {
  if (totals.totalsByAsset.length === 0) return "—";
  return totals.totalsByAsset.map((t) => `${t.total.toFixed(2)} ${t.asset}`).join(" · ");
}
