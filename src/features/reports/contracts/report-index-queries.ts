// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { envConfig } from "@/config.ts";
import {
  fetchTerminalReportIndex,
  type TerminalReportIndex,
  type TerminalReportIndexState,
  type TerminalReportRef,
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
  TerminalReportRef,
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

export function reportIndexQueryOptions(ref: TerminalReportRef | null) {
  return queryOptions({
    queryKey: queryKeys.reportIndex(ref?.shopKey ?? ""),
    queryFn: (): Promise<TerminalReportIndex> => {
      if (ref == null) {
        throw new Error("reportIndexQueryOptions: ref is null");
      }
      // Demo terminals exist but have no on-chain reports.
      if (isDemoMode()) {
        return Promise.resolve({ shopKey: ref.shopKey, count: 0, entries: [] });
      }
      return fetchTerminalReportIndex(ref);
    },
    enabled: ref != null,
  });
}

/**
 * Adapter hook: project one terminal's report-index query into the
 * `TerminalReportIndexState` union. `idle` for a null shopKey,
 * `config-error` when the contract address is missing (real mode),
 * otherwise the usual loading / ready / error progression.
 */
export function useT3rminalReportIndex(
  ref: TerminalReportRef | null,
): TerminalReportIndexState {
  const query = useQuery(reportIndexQueryOptions(ref));

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.reportIndex });
  }, []);

  if (ref == null) {
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
  refs: ReadonlyArray<TerminalReportRef>,
): AllTerminalReportIndicesState {
  const results = useQueries({
    queries: refs.map((ref) => reportIndexQueryOptions(ref)),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryRoots.reportIndex });
  }, []);

  if (refs.length === 0) {
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
  for (let i = 0; i < refs.length; i += 1) {
    const result = results[i];
    const ref = refs[i];
    if (result == null || ref == null) continue;
    if (result.isError) {
      indices.set(ref.shopKey, null);
    } else if (result.data != null) {
      indices.set(ref.shopKey, result.data);
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
