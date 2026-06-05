/**
 * `DailyReport` mirror — the JSON shape T3rminal-v1 puts on Bulletin
 * Chain inside the encrypted envelope. Mirrored locally so the admin
 * console can decode reports without a build-time dependency on
 * `apps/t3rminal-v1` (which is a Next app with its own toolchain).
 *
 * Authoritative producer: `apps/t3rminal-v1/lib/hooks/use-bulletin.ts:44`.
 * Keep these types compatible — extra fields are tolerated by
 * `parseDailyReport` so a forward-version producer doesn't break us.
 */

// ── Public types ───────────────────────────────────────────────────

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

// ── Defensive parser ───────────────────────────────────────────────

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
