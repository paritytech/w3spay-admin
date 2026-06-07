/**
 * Report-index read queries for the Reports surfaces.
 *
 * `reportIndexQueryOptions` is the shared factory; `useT3rminalReportIndex`
 * adapts a single `useQuery` into the `TerminalReportIndexState` machine
 * the per-terminal drill-in branches on, and `useAllTerminalReportIndices`
 * fans out across every shopKey via `useQueries` to feed the Reports tab.
 *
 * The pure fetch (`fetchTerminalReportIndex`) and config resolution
 * (`resolveBulletinIndexAddress`) still live in `bulletin-index-read.ts`;
 * this module only owns the query plumbing and the demo short-circuit
 * (inside the `queryFn`, returning the empty-index state demo terminals
 * always render).
 */

import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { envConfig } from "@shared/config";
import {
  fetchTerminalReportIndex,
  type TerminalReportIndex,
  type TerminalReportIndexState,
} from "./bulletin-index-read.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import { queryKeys, queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

// Named types live in `bulletin-index-read.ts`; re-export so consumers
// import the contract from the query module without a `ReturnType<...>`.
export type {
  ReportIndexEntry,
  TerminalReportIndex,
  TerminalReportIndexState,
} from "./bulletin-index-read.ts";

/**
 * Message surfaced when `VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS` is empty.
 * Mirrors the error `resolveBulletinIndexAddress` throws so the
 * `config-error` reason is identical to the legacy hook's.
 */
const BULLETIN_INDEX_NOT_CONFIGURED =
  "VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS is empty. Set it to the deployed `T3rminalBulletinIndex` H160.";

/** True when the bulletin-index contract address is configured. */
export function bulletinIndexConfigured(): boolean {
  return envConfig.contracts.t3rminalBulletinIndexAddress.trim() !== "";
}

export function reportIndexQueryOptions(shopKey: `0x${string}` | null) {
  return queryOptions({
    queryKey: queryKeys.reportIndex(shopKey ?? ""),
    queryFn: (): Promise<TerminalReportIndex> => {
      // `enabled` guarantees a non-null shopKey.
      if (shopKey == null) {
        throw new Error("reportIndexQueryOptions: shopKey is null");
      }
      // Demo terminals exist but have produced no reports yet — hand back
      // the empty index the demo surface renders as its standard state.
      if (isDemoMode()) {
        return Promise.resolve({ shopKey, count: 0, entries: [] });
      }
      return fetchTerminalReportIndex(shopKey);
    },
    enabled: shopKey != null,
  });
}

/**
 * Adapter hook: project one terminal's report-index query into the
 * `TerminalReportIndexState` union. `idle` for a null shopKey,
 * `config-error` when the contract address is missing (real mode),
 * otherwise the usual loading / ready / error progression.
 */
export function useT3rminalReportIndex(
  shopKey: `0x${string}` | null,
): TerminalReportIndexState {
  const query = useQuery(reportIndexQueryOptions(shopKey));

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.reportIndex });
  }, []);

  if (shopKey == null) {
    return { kind: "idle" };
  }
  if (!isDemoMode() && !bulletinIndexConfigured()) {
    return { kind: "config-error", reason: BULLETIN_INDEX_NOT_CONFIGURED, refresh };
  }
  if (query.isError) {
    return {
      kind: "error",
      reason: query.error instanceof Error ? query.error.message : String(query.error),
      refresh,
    };
  }
  if (query.data != null) {
    return { kind: "ready", index: query.data, refresh };
  }
  return { kind: "loading" };
}

// ── Aggregate (Reports tab list) ───────────────────────────────────

const EMPTY_INDICES: ReadonlyMap<`0x${string}`, TerminalReportIndex | null> = new Map();

/** Aggregate fan-out state across every shopKey on the Reports tab. */
export interface AllTerminalReportIndicesState {
  readonly state: "idle" | "loading" | "ready" | "config-error";
  readonly reason: string | null;
  readonly indices: ReadonlyMap<`0x${string}`, TerminalReportIndex | null>;
  refresh(): Promise<void>;
}

/**
 * Resolve indices for every shopKey via `useQueries`. Each terminal's
 * lookup is isolated: a per-row failure yields `null` in the map instead
 * of failing the whole list. The map fills in progressively as queries
 * resolve; `state` is `ready` once none remain pending.
 */
export function useAllTerminalReportIndices(
  shopKeys: ReadonlyArray<`0x${string}`>,
): AllTerminalReportIndicesState {
  const results = useQueries({
    queries: shopKeys.map((shopKey) => reportIndexQueryOptions(shopKey)),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.reportIndex });
  }, []);

  if (shopKeys.length === 0) {
    return { state: "ready", reason: null, indices: EMPTY_INDICES, refresh };
  }
  if (!isDemoMode() && !bulletinIndexConfigured()) {
    return {
      state: "config-error",
      reason: BULLETIN_INDEX_NOT_CONFIGURED,
      indices: EMPTY_INDICES,
      refresh,
    };
  }

  const indices = new Map<`0x${string}`, TerminalReportIndex | null>();
  let pending = false;
  for (let i = 0; i < shopKeys.length; i += 1) {
    const result = results[i];
    const shopKey = shopKeys[i];
    if (result == null || shopKey == null) continue;
    if (result.isError) {
      indices.set(shopKey, null);
    } else if (result.data != null) {
      indices.set(shopKey, result.data);
    } else {
      pending = true;
    }
  }

  return {
    state: pending ? "loading" : "ready",
    reason: null,
    indices,
    refresh,
  };
}
