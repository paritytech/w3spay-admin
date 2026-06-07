/**
 * Pure helpers for the Reports → Transactions stream.
 *
 * The Reports surface fans out across `(shopKey, date)` pairs from
 * `T3rminalBulletinIndex`, decrypts each day's report, and renders a
 * single chronological transaction list windowed to 24h / 7d / 30d.
 * Everything network / React / cache lives elsewhere — this module is
 * the deterministic, side-effect-free core that can be unit-tested
 * without mounting React.
 *
 * Window semantics: rolling-N from `now`. Day-level filtering keeps the
 * boundary day so partial-day transactions aren't dropped at the index
 * step; transaction-level filtering (`timestampMs >= sinceMs`) trims
 * the remainder during flattening.
 */

import type {
  DailyReport,
  DailyReportTransaction,
} from "./daily-report.ts";

// ── Window ─────────────────────────────────────────────────────────

/** Stream window selector. */
export type StreamWindow = "24h" | "7d" | "30d";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Duration of a window in milliseconds. Exposed so the view can label
 * "Last 7 days" / "Last 30 days" without repeating the conversion.
 */
export function windowDurationMs(window: StreamWindow): number {
  switch (window) {
    case "24h":
      return DAY_MS;
    case "7d":
      return 7 * DAY_MS;
    case "30d":
      return 30 * DAY_MS;
  }
}

/** Inclusive lower bound for transaction timestamps in the window. */
export function windowSinceMs(window: StreamWindow, now: number): number {
  return now - windowDurationMs(window);
}

/**
 * Filter ISO `YYYY-MM-DD` dates to those whose UTC calendar day is at
 * or after the window's boundary day. The boundary day is kept whole so
 * partial-day transactions aren't dropped — transaction-level filtering
 * via `timestampMs >= sinceMs` happens in {@link flattenReports}.
 */
export function datesInWindow(
  dates: ReadonlyArray<string>,
  window: StreamWindow,
  now: number,
): string[] {
  const boundaryDay = isoDayUtc(windowSinceMs(window, now));
  const out: string[] = [];
  for (const date of dates) {
    if (typeof date !== "string") continue;
    if (date >= boundaryDay) out.push(date);
  }
  return out;
}

function isoDayUtc(ms: number): string {
  // `toISOString` is always `YYYY-MM-DDTHH:mm:ss.sssZ`.
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Stream shape ────────────────────────────────────────────────────

/**
 * Terminal identity carried alongside every stream entry so the
 * aggregate view can label rows with the originating terminal.
 */
export interface TerminalRef {
  /** Registry `terminalKey` — stable across renames. */
  readonly key: string;
  /** Display name (falls back to terminalId upstream). */
  readonly name: string;
  /** `t3r-…` terminal id used for short labels. */
  readonly terminalId: string;
}

/** A single transaction with the context the UI needs to render it. */
export interface StreamTransaction {
  readonly tx: DailyReportTransaction;
  readonly terminal: TerminalRef;
  /** `YYYY-MM-DD` of the source daily report (UTC date bucket). */
  readonly dateBucket: string;
  /** Parsed unix-ms timestamp; `0` when the producer string is unparseable. */
  readonly timestampMs: number;
}

/** Input to {@link flattenReports}. */
export interface ReportBucket {
  readonly terminal: TerminalRef;
  readonly date: string;
  readonly report: DailyReport;
}

/**
 * Flatten a collection of decrypted daily reports into one transaction
 * stream filtered by `sinceMs` and sorted desc by `timestampMs`.
 *
 * Transactions whose `timestamp` is not a positive finite number sort
 * to the bottom (timestamp 0) but are still surfaced — the operator
 * gets the row, just without an exact time, instead of silent loss.
 */
export function flattenReports(
  reports: ReadonlyArray<ReportBucket>,
  sinceMs: number,
): StreamTransaction[] {
  const out: StreamTransaction[] = [];
  for (const { terminal, date, report } of reports) {
    for (const tx of report.transactions) {
      const parsed = Number(tx.timestamp);
      const valid = Number.isFinite(parsed) && parsed > 0;
      if (valid && parsed < sinceMs) continue;
      out.push({
        tx,
        terminal,
        dateBucket: date,
        timestampMs: valid ? parsed : 0,
      });
    }
  }
  out.sort((a, b) => b.timestampMs - a.timestampMs);
  return out;
}

// ── Summary ────────────────────────────────────────────────────────

/** Per-asset Finished totals returned from {@link summarize}. */
export interface StreamSummaryByAsset {
  /**
   * Sum of `Number(tx.amountFormatted)` across Finished rows for this
   * asset. We sum the producer's already-decimal-shifted display value
   * (e.g. `"1.50"`) rather than the raw smallest-unit `bigint` because
   * the admin app has no source of truth for per-asset decimals — the
   * formatted string is the only display-correct number the producer
   * gives us. Float precision is acceptable at admin-console scales.
   */
  readonly amount: number;
  /** Number of Finished rows contributing to `amount`. */
  readonly count: number;
}

/** Result of {@link summarize}. */
export interface StreamSummary {
  /** Total tx count in the stream — Finished AND Refunded. */
  readonly count: number;
  /**
   * Refunds are NOT subtracted — gross volume is what the totals card
   * reports, with the refund pill carrying the per-row signal.
   */
  readonly finishedByAsset: ReadonlyMap<string, StreamSummaryByAsset>;
}

/**
 * Aggregate volume from a stream. Refund rows are still counted in the
 * total transaction count but contribute nothing to per-asset sums.
 */
export function summarize(stream: ReadonlyArray<StreamTransaction>): StreamSummary {
  const totals = new Map<string, { amount: number; count: number }>();
  let count = 0;
  for (const entry of stream) {
    count += 1;
    if (entry.tx.status !== "Finished") continue;
    const amount = parseAmountFormatted(entry.tx.amountFormatted);
    if (amount == null) continue;
    const cur = totals.get(entry.tx.asset);
    if (cur == null) {
      totals.set(entry.tx.asset, { amount, count: 1 });
    } else {
      cur.amount += amount;
      cur.count += 1;
    }
  }
  return { count, finishedByAsset: totals };
}

/**
 * Parse the producer's `amountFormatted` (e.g. `"1.50"`, `"0.00075"`)
 * into a `number`. Rejects anything that isn't a decimal numeric string
 * — no thousands separators, no scientific notation — because the
 * producer commits to that shape.
 */
function parseAmountFormatted(raw: string): number | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
import type { ReportIndexEntry } from "@features/reports/contracts/bulletin-index-read.ts";

export interface TransactionsStreamTerminal {
  readonly terminal: TerminalRef;
  /** Lowercased registry `terminalKey`, the on-chain `shopKey`. */
  readonly shopKey: `0x${string}`;
  /** QR-shared password; `null` keeps the terminal's days in `no-password`. */
  readonly reportPassword: string | null;
  /** Newest-first list of (date, metadata) rows from the index. */
  readonly entries: ReadonlyArray<ReportIndexEntry>;
}

export interface UseTransactionsStreamArgs {
  readonly terminals: ReadonlyArray<TransactionsStreamTerminal>;
  readonly window: StreamWindow;
  readonly gatewayBase: string;
}

export interface TransactionsStreamFailure {
  readonly terminalKey: string;
  readonly terminalName: string;
  readonly date: string;
  readonly kind:
    | "fetch-error"
    | "decrypt-error"
    | "parse-error"
    | "invalid"
    | "legacy-v1";
  readonly reason: string;
}

export interface TransactionsStreamMissingPassword {
  readonly key: string;
  readonly name: string;
}

export type TransactionsStreamLoadState = "loading" | "partial" | "ready";

export interface UseTransactionsStreamResult {
  readonly state: TransactionsStreamLoadState;
  readonly transactions: ReadonlyArray<StreamTransaction>;
  /** Inclusive lower bound on `timestampMs` for the current window. */
  readonly sinceMs: number;
  readonly now: number;
  readonly totalDays: number;
  readonly loadedDays: number;
  readonly failures: ReadonlyArray<TransactionsStreamFailure>;
  readonly missingPasswordTerminals: ReadonlyArray<TransactionsStreamMissingPassword>;
  refresh(): void;
}
