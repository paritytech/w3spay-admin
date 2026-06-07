/**
 * Read-side wrapper around the `T3rminalBulletinIndex` contract.
 *
 * The contract is *write-once-per-day* on the t3rminal side and never
 * written from the admin app — see
 * `apps/t3rminal-v1/contracts/src/T3rminalBulletinIndex.sol`. From here we
 * only need to enumerate dates and pull each day's metadata (CID +
 * entryCount + publishedAt) so the Reports UI can render a per-terminal
 * timeline and fetch the encrypted payload by CID.
 *
 * `shopKey` semantics: in the production end-state, the admin uses each
 * T3rminal merchant's registry `terminalKey` (`AdminMerchant.key`). The
 * existing t3rminal-v1 producer still keys writes by
 * `keccak256(URL host)`, which means the admin's reads will return empty
 * lists until that producer migrates. The Reports surface treats an empty
 * list as a first-class state.
 */

import { readContract } from "@/shared/chain/contracts/index.ts";

import { envConfig } from "@shared/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { T3rminalBulletinIndexABI } from "./bulletin-index-abi.ts";

// ── Public types ───────────────────────────────────────────────────

/**
 * One day's metadata as the contract returns it. Field names mirror the
 * Solidity `IT3rminalBulletinIndex.DayMetadata` struct exactly so a
 * future codegen step can drop the manual decoder.
 */
export interface DayMetadata {
  readonly cid: string;
  readonly entryCount: number;
  /** Unix seconds at which `storeDailyReport` was last called for this date. */
  readonly publishedAt: number;
  readonly exists: boolean;
}

/** Per-date row used by the Reports drill-in view. Sorted newest-first. */
export interface ReportIndexEntry {
  readonly date: string;
  readonly metadata: DayMetadata;
}

/** Resolved per-terminal report index. */
export interface TerminalReportIndex {
  readonly shopKey: `0x${string}`;
  readonly count: number;
  readonly entries: ReadonlyArray<ReportIndexEntry>;
}

export type TerminalReportIndexState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "config-error";
      readonly reason: string;
      readonly refresh: () => Promise<void>;
    }
  | {
      readonly kind: "error";
      readonly reason: string;
      readonly refresh: () => Promise<void>;
    }
  | {
      readonly kind: "ready";
      readonly index: TerminalReportIndex;
      readonly refresh: () => Promise<void>;
    };

// ── Pure helpers ───────────────────────────────────────────────────

/**
 * Resolve the configured `T3rminalBulletinIndex` address, or throw a
 * typed error so the hook can surface a config-missing state instead of
 * silently calling against `0x` and erroring on the chain side.
 */
export function resolveBulletinIndexAddress(): `0x${string}` {
  const raw = envConfig.contracts.t3rminalBulletinIndexAddress.trim();
  if (raw.length === 0) {
    throw new Error(
      "VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS is empty. Set it to the deployed `T3rminalBulletinIndex` H160.",
    );
  }
  return raw.toLowerCase() as `0x${string}`;
}

/**
 * Pure async fetch — enumerate `getAllDates` then resolve each date's
 * metadata in parallel. Newest dates first.
 *
 * Returns `count: 0, entries: []` when the contract reports no dates for
 * the shop. Does NOT swallow underlying read errors — the caller decides
 * whether to surface those.
 */
export async function fetchTerminalReportIndex(
  shopKey: `0x${string}`,
  address: `0x${string}` = resolveBulletinIndexAddress(),
): Promise<TerminalReportIndex> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const [dates] = await readContract<[ReadonlyArray<string>]>(client, {
    address,
    abi: T3rminalBulletinIndexABI,
    functionName: "getAllDates",
    args: [shopKey],
    origin,
    at: "best",
  });
  if (dates.length === 0) {
    return { shopKey, count: 0, entries: [] };
  }

  const rawMetadatas = await Promise.all(
    dates.map(async (date) => {
      const [meta] = await readContract<[RawDayMetadata]>(client, {
        address,
        abi: T3rminalBulletinIndexABI,
        functionName: "getMetadata",
        args: [shopKey, date],
        origin,
        at: "best",
      });
      return { date, metadata: normalizeMetadata(meta) };
    }),
  );

  // Skip rows the contract reports as non-existent (shouldn't happen for
  // dates returned by `getAllDates`, but defensive against a future
  // contract revision that retains stale date entries).
  const entries = rawMetadatas
    .filter((entry) => entry.metadata.exists)
    .sort((a, b) => b.date.localeCompare(a.date));

  return { shopKey, count: entries.length, entries };
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Shape viem hands us back from `getMetadata`'s tuple output. Treated as
 * `unknown` at the call site and narrowed here.
 */
interface RawDayMetadata {
  readonly cid: string;
  readonly entryCount: bigint;
  readonly publishedAt: bigint;
  readonly exists: boolean;
}

function normalizeMetadata(raw: RawDayMetadata): DayMetadata {
  return {
    cid: raw.cid,
    entryCount: Number(raw.entryCount),
    publishedAt: Number(raw.publishedAt),
    exists: raw.exists,
  };
}
