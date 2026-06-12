// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Local T3rminal merchant ↔ item-config assignments as a Zustand store
 * (host-KV / localStorage backed). Replaces the `useT3rminalAssignments`
 * hook.
 *
 */

import { useEffect } from "react";
import { create } from "zustand";

import { cachedAdminKvStore, getAdminKvStore } from "./admin-kv.ts";
import {
  T3RMINAL_ASSIGNMENTS_KEY,
  decodeAssignmentsPayload,
  encodeAssignmentsPayload,
  mintAssignmentRecord,
  type T3rminalAssignmentV1,
  type UpsertAssignmentArgs,
  type UseT3rminalAssignmentsResult,
} from "./t3rminal-assignments.ts";

export interface AssignmentsState extends UseT3rminalAssignmentsResult {
  /** Read KV once. Idempotent across calls. */
  hydrate(): Promise<void>;
}

let hydrating: Promise<void> | null = null;

function persist(next: ReadonlyMap<string, T3rminalAssignmentV1>): void {
  const store = cachedAdminKvStore();
  if (store == null) return;
  void store.setJSON(T3RMINAL_ASSIGNMENTS_KEY, encodeAssignmentsPayload(next));
}

export const useAssignmentsStore = create<AssignmentsState>((set, get) => ({
  assignments: new Map(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrating != null) return hydrating;
    hydrating = (async () => {
      const store = await getAdminKvStore();
      if (store == null) {
        set({ hydrated: true });
        return;
      }
      try {
        const raw = await store.getJSON<unknown>(T3RMINAL_ASSIGNMENTS_KEY);
        set({ assignments: decodeAssignmentsPayload(raw) });
      } catch (caught) {
        console.warn("[t3rminal-assignments] hydrate failed", caught);
      } finally {
        set({ hydrated: true });
      }
    })();
    return hydrating;
  },

  upsertAssignment: (args: UpsertAssignmentArgs): T3rminalAssignmentV1 => {
    const record = mintAssignmentRecord({
      merchant: args.merchant,
      config: args.config,
      itemConfigCid: args.itemConfigCid,
      adminPublicKey: args.adminPublicKey,
      existing: get().assignments.get(args.merchant.key) ?? null,
      passcode: args.passcode,
      nowIso: args.nowIso,
      payloadVersion: args.payloadVersion,
    });
    const next = new Map(get().assignments);
    next.set(args.merchant.key, record);
    set({ assignments: next });
    persist(next);
    return record;
  },

  removeAssignment: (merchantKey: string) => {
    const current = get().assignments;
    if (!current.has(merchantKey)) return;
    const next = new Map(current);
    next.delete(merchantKey);
    set({ assignments: next });
    persist(next);
  },
}));

/**
 * Consumer hook: triggers hydration on mount and returns the
 * `UseT3rminalAssignmentsResult` slice.
 */
export function useT3rminalAssignments(): UseT3rminalAssignmentsResult {
  const hydrate = useAssignmentsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return useAssignmentsStore();
}
