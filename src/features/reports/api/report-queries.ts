/**
 * Daily-report read queries for the Reports → Transactions stream and
 * the per-day detail panel.
 *
 * Two query families share the fetch→decode→decrypt→parse pipeline:
 *   - `dailyReportQueryOptions` / `useTransactionsStream` fan out across
 *     (terminal × date) jobs and derive a flattened transaction stream.
 *   - `decryptedReportQueryOptions` / `useDecryptedReport` resolve a
 *     single (cid, password) pair for the detail panel.
 *
 * A module-level semaphore caps concurrent IPFS fetches at
 * {@link MAX_CONCURRENCY}. Browser gateways limit total connections per
 * origin anyway, so over-fanning made progress jittery without speeding
 * total throughput. Only the network fetch is gated — decrypt/parse are
 * CPU-bound and run outside the slot. Both load helpers RESOLVE to a
 * categorized union (never throw) so the adapters map cleanly to their
 * UI state machines.
 */

import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchReportEnvelope, type FetchReportResult } from "./fetch-report.ts";
import { parseDailyReport, type DailyReport } from "@features/reports/daily-report.ts";
import {
  decryptReportV2,
  DecryptReportError,
  type DecryptedReportState,
  type EncryptedReportMeta,
  type UseDecryptedReportArgs,
} from "@features/reports/encrypted-report.ts";
import {
  flattenReports,
  datesInWindow,
  windowSinceMs,
  type ReportBucket,
  type TerminalRef,
  type TransactionsStreamFailure,
  type TransactionsStreamLoadState,
  type TransactionsStreamMissingPassword,
  type TransactionsStreamTerminal,
  type UseTransactionsStreamArgs,
  type UseTransactionsStreamResult,
} from "@features/reports/transaction-stream.ts";
import { queryKeys } from "@shared/api/keys.ts";
import { queryClient } from "@shared/api/query-client.ts";

// ── Concurrency cap ────────────────────────────────────────────────

/** Cap on concurrent IPFS fetches. */
export const MAX_CONCURRENCY = 6;

let active = 0;
const waiters: Array<() => void> = [];

/** Acquire a fetch slot, queueing when the cap is reached. */
function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  const { promise, resolve } = Promise.withResolvers<void>();
  waiters.push(resolve);
  return promise;
}

/** Release a fetch slot, handing it straight to the next waiter if any. */
function release(): void {
  const next = waiters.shift();
  if (next != null) {
    // Slot transferred without decrementing — the waiter takes it over.
    next();
    return;
  }
  active -= 1;
}

// ── Shared decrypt-error formatting ────────────────────────────────

function decryptReason(caught: unknown): string {
  if (caught instanceof DecryptReportError) {
    return `${caught.code}: ${caught.message}`;
  }
  if (caught instanceof Error) return caught.message;
  return String(caught);
}

// ── Daily-report load (transactions stream) ────────────────────────

/**
 * Categorized result of loading one day's report. Mirrors
 * `CachedDayState` minus the synthetic `idle` / `no-password` / `loading`
 * markers — those are represented by the query being disabled or pending.
 */
export type DailyReportLoadResult =
  | { readonly kind: "ready"; readonly report: DailyReport }
  | { readonly kind: "legacy-v1" }
  | { readonly kind: "fetch-error"; readonly reason: string }
  | { readonly kind: "decrypt-error"; readonly reason: string }
  | { readonly kind: "parse-error" }
  | { readonly kind: "invalid"; readonly reason: string };

/**
 * Fetch (inside the semaphore) then decrypt + parse one day's report.
 * Never throws — resolves to a {@link DailyReportLoadResult} so the
 * stream can treat every outcome as "this day will not change again".
 */
export async function loadDailyReport(
  cid: string,
  password: string,
  gatewayBase: string,
): Promise<DailyReportLoadResult> {
  await acquire();
  let result: FetchReportResult;
  try {
    result = await fetchReportEnvelope({ cid, gatewayBase });
  } finally {
    release();
  }

  if (result.kind === "http-error") {
    return { kind: "fetch-error", reason: `HTTP ${result.status} ${result.statusText}` };
  }
  if (result.kind === "network-error" || result.kind === "json-error") {
    return { kind: "fetch-error", reason: result.reason };
  }
  const envelope = result.envelope;
  if (envelope.kind === "invalid") {
    return { kind: "invalid", reason: envelope.reason };
  }
  if (envelope.kind === "legacy-v1") {
    return { kind: "legacy-v1" };
  }
  // envelope.kind === "v2"
  let plaintext: string;
  try {
    plaintext = decryptReportV2(envelope.envelope, password);
  } catch (caught) {
    return { kind: "decrypt-error", reason: decryptReason(caught) };
  }
  let json: unknown;
  try {
    json = JSON.parse(plaintext);
  } catch {
    return { kind: "parse-error" };
  }
  const report = parseDailyReport(json);
  if (report == null) {
    return { kind: "parse-error" };
  }
  return { kind: "ready", report };
}

export interface DailyReportQueryArgs {
  readonly shopKey: `0x${string}`;
  readonly date: string;
  readonly cid: string;
  /** `null` keeps the query disabled — the stream derives `no-password`. */
  readonly password: string | null;
  readonly gatewayBase: string;
}

export function dailyReportQueryOptions(args: DailyReportQueryArgs) {
  const { shopKey, date, cid, password, gatewayBase } = args;
  return queryOptions({
    queryKey: queryKeys.dailyReport(shopKey, date),
    queryFn: (): Promise<DailyReportLoadResult> => {
      // `enabled` guarantees a non-null password.
      if (password == null) {
        throw new Error("dailyReportQueryOptions: password is null");
      }
      return loadDailyReport(cid, password, gatewayBase);
    },
    enabled: password != null,
  });
}

// ── Transactions stream ────────────────────────────────────────────

interface StreamJob {
  readonly shopKey: `0x${string}`;
  readonly date: string;
  readonly cid: string;
  readonly password: string | null;
  readonly terminalRef: TerminalRef;
}

/**
 * Windowed, progressively-decrypting transaction stream across one or
 * many terminals. Owns `now` so flipping the window doesn't drift the
 * boundary; `refresh` advances it. Fans out one daily-report query per
 * (terminal × in-window date) job via `useQueries`, then derives the
 * flattened stream plus load/failure/missing-password bookkeeping.
 */
export function useTransactionsStream(
  args: UseTransactionsStreamArgs,
): UseTransactionsStreamResult {
  const { terminals, gatewayBase } = args;
  const streamWindow = args.window;

  const [now, setNow] = useState<number>(() => Date.now());
  const refresh = useCallback(() => setNow(Date.now()), []);

  const jobs = useMemo<ReadonlyArray<StreamJob>>(() => {
    const out: StreamJob[] = [];
    for (const t of terminals) {
      if (t.entries.length === 0) continue;
      const dateSet = new Set(
        datesInWindow(
          t.entries.map((e) => e.date),
          streamWindow,
          now,
        ),
      );
      for (const entry of t.entries) {
        if (!dateSet.has(entry.date)) continue;
        out.push({
          shopKey: t.shopKey,
          date: entry.date,
          cid: entry.metadata.cid,
          password: t.reportPassword,
          terminalRef: t.terminal,
        });
      }
    }
    return out;
  }, [terminals, streamWindow, now]);

  const results = useQueries({
    queries: jobs.map((job) =>
      dailyReportQueryOptions({
        shopKey: job.shopKey,
        date: job.date,
        cid: job.cid,
        password: job.password,
        gatewayBase,
      }),
    ),
  });

  const sinceMs = useMemo(() => windowSinceMs(streamWindow, now), [streamWindow, now]);

  // `dataFingerprint` is the recompute cursor: each query's
  // `dataUpdatedAt` bumps when its result lands, so the derived snapshot
  // recomputes as days resolve without depending on the unstable
  // `results` array identity.
  const dataFingerprint = results.map((r) => r.dataUpdatedAt).join(",");

  const snapshot = useMemo(() => {
    const buckets: ReportBucket[] = [];
    const failures: TransactionsStreamFailure[] = [];
    let loaded = 0;
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      if (job == null) continue;
      if (job.password == null) {
        // `no-password` counts as loaded, never a failure.
        loaded += 1;
        continue;
      }
      const data = results[i]?.data;
      if (data == null) {
        // Query pending — not loaded yet.
        continue;
      }
      loaded += 1;
      if (data.kind === "ready") {
        buckets.push({ terminal: job.terminalRef, date: job.date, report: data.report });
      } else {
        failures.push({
          terminalKey: job.terminalRef.key,
          terminalName: job.terminalRef.name,
          date: job.date,
          kind: data.kind,
          reason: reasonOf(data),
        });
      }
    }
    const transactions = flattenReports(buckets, sinceMs);
    const missingPasswordTerminals = collectMissingPassword(terminals);
    const totalDays = jobs.length;
    let loadState: TransactionsStreamLoadState;
    if (totalDays === 0 || loaded >= totalDays) loadState = "ready";
    else if (loaded > 0) loadState = "partial";
    else loadState = "loading";
    return {
      state: loadState,
      transactions,
      sinceMs,
      now,
      totalDays,
      loadedDays: loaded,
      failures,
      missingPasswordTerminals,
    };
    // `dataFingerprint` is the external cursor — `results` is read but
    // intentionally not a dep so the memo recomputes only when data lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, sinceMs, terminals, now, dataFingerprint]);

  return { ...snapshot, refresh };
}

/** Human-readable reason for a non-ready daily-report load result. */
function reasonOf(result: DailyReportLoadResult): string {
  switch (result.kind) {
    case "fetch-error":
    case "decrypt-error":
    case "invalid":
      return result.reason;
    case "parse-error":
      return "payload didn't match the daily-report shape";
    case "legacy-v1":
      return "legacy v1 envelope — admin cannot decrypt";
    default:
      return "";
  }
}

/**
 * Terminals that have index entries but no QR-shared report password —
 * the stream surfaces these so the UI can prompt for the missing QR.
 */
function collectMissingPassword(
  terminals: ReadonlyArray<TransactionsStreamTerminal>,
): ReadonlyArray<TransactionsStreamMissingPassword> {
  const out: TransactionsStreamMissingPassword[] = [];
  for (const t of terminals) {
    if (t.reportPassword != null) continue;
    if (t.entries.length === 0) continue;
    out.push({ key: t.terminal.key, name: t.terminal.name });
  }
  return out;
}

// ── Single decrypted report (detail panel) ─────────────────────────

/**
 * Categorized result of decrypting a single report for the detail panel.
 * Carries `meta` on the success / legacy paths so the panel can render
 * the envelope header without re-fetching.
 */
export type DecryptedReportLoadResult =
  | { readonly kind: "ready"; readonly report: DailyReport; readonly meta: EncryptedReportMeta }
  | { readonly kind: "legacy-v1"; readonly meta: EncryptedReportMeta | null }
  | { readonly kind: "corrupt"; readonly reason: string }
  | { readonly kind: "decrypt-error"; readonly reason: string }
  | { readonly kind: "parse-error" }
  | { readonly kind: "fetch-error"; readonly reason: string };

/**
 * Fetch + decode + decrypt + parse one (cid, password) pair. Never
 * throws — resolves to a {@link DecryptedReportLoadResult}. Unlike the
 * stream path this is an on-demand single read, so it does not take a
 * semaphore slot.
 */
async function loadDecryptedReport(
  cid: string,
  password: string,
  gatewayBase: string,
): Promise<DecryptedReportLoadResult> {
  const result = await fetchReportEnvelope({ cid, gatewayBase });
  if (result.kind === "http-error") {
    return { kind: "fetch-error", reason: `HTTP ${result.status} ${result.statusText}` };
  }
  if (result.kind === "network-error" || result.kind === "json-error") {
    return { kind: "fetch-error", reason: result.reason };
  }
  const envelope = result.envelope;
  if (envelope.kind === "invalid") {
    return { kind: "corrupt", reason: envelope.reason };
  }
  if (envelope.kind === "legacy-v1") {
    return { kind: "legacy-v1", meta: envelope.meta };
  }
  // envelope.kind === "v2"
  let plaintext: string;
  try {
    plaintext = decryptReportV2(envelope.envelope, password);
  } catch (caught) {
    return { kind: "decrypt-error", reason: decryptReason(caught) };
  }
  let json: unknown;
  try {
    json = JSON.parse(plaintext);
  } catch {
    return { kind: "parse-error" };
  }
  const report = parseDailyReport(json);
  if (report == null) {
    return { kind: "parse-error" };
  }
  return { kind: "ready", report, meta: envelope.envelope.meta };
}

export function decryptedReportQueryOptions(
  cid: string | null,
  password: string | null,
  gatewayBase: string,
) {
  return queryOptions({
    queryKey: queryKeys.decryptedReport(cid ?? ""),
    queryFn: (): Promise<DecryptedReportLoadResult> => {
      // `enabled` guarantees a non-null cid + password.
      if (cid == null || password == null) {
        throw new Error("decryptedReportQueryOptions: cid/password is null");
      }
      return loadDecryptedReport(cid, password, gatewayBase);
    },
    enabled: cid != null && password != null,
  });
}

/**
 * Adapter hook: project the single-report query into the
 * `DecryptedReportState` union the detail panel switches on. `idle` for a
 * null cid/password, `loading` while pending, then the categorized
 * outcome. `refresh` invalidates the report's key so a retry re-runs.
 */
export function useDecryptedReport(args: UseDecryptedReportArgs): DecryptedReportState {
  const { cid, reportPassword, gatewayBase } = args;
  const query = useQuery(decryptedReportQueryOptions(cid, reportPassword, gatewayBase));

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.decryptedReport(cid ?? ""),
    });
  }, [cid]);

  if (cid == null || reportPassword == null) {
    return { kind: "idle" };
  }
  const data = query.data;
  if (data == null) {
    return { kind: "loading" };
  }
  switch (data.kind) {
    case "ready":
      return { kind: "ready", report: data.report, meta: data.meta, refresh };
    case "legacy-v1":
      return { kind: "legacy-v1", meta: data.meta, refresh };
    case "corrupt":
      return { kind: "corrupt", reason: data.reason, refresh };
    case "decrypt-error":
      return { kind: "decrypt-error", reason: data.reason, refresh };
    case "parse-error":
      return { kind: "parse-error", refresh };
    case "fetch-error":
      return { kind: "fetch-error", reason: data.reason, refresh };
  }
}
