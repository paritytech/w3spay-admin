// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useCallback, useState } from "react";
import { withSpan } from "@/shared/lib/sentry/index.ts";

import { journeyTracker } from "@shared/lib/telemetry.ts";
import { publishItemConfig } from "./item-config-storage.ts";
import { contextFor, upsertItemConfig } from "./item-config-writes.ts";
import { dirtyConfigIds, type PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import type { PublishProgress, SaveAllResult } from "@features/items/item-configs.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { queryRoots } from "@shared/chain/keys.ts";
import {
  itemConfigRegistryQueryOptions,
  type ItemConfigRegistrySnapshot,
} from "./item-config-queries.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import {
  publishFailureToast,
  publishStartToast,
  publishStatusToast,
  publishSuccessToast,
} from "./item-config-publish-toast.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { useItemDraftsStore } from "@features/items/store/use-item-drafts-store.ts";

/**
 * Map a publish failure onto a categorical journey reason. Keeps
 * `journey.failure_reason` constrained to a closed set so the dashboard
 * filter stays stable.
 */
function categorizePublishError(caught: unknown): string {
  if (!(caught instanceof Error)) return "unknown";
  const msg = caught.message.toLowerCase();
  if (msg.includes("not ready") || msg.includes("signer")) return "preflight";
  if (msg.includes("user rejected") || msg.includes("cancel")) return "user-rejected";
  if (msg.includes("bulletin") || msg.includes("ipfs") || msg.includes("cid")) return "bulletin";
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return "network";
  if (msg.includes("dispatch") || msg.includes("revert")) return "dispatch-error";
  return "unknown";
}

function readPublishedSnapshots(): ReadonlyMap<string, PublishedConfigSnapshot> {
  return (
    queryClient.getQueryData<ItemConfigRegistrySnapshot>(
      itemConfigRegistryQueryOptions().queryKey,
    )?.publishedSnapshots ?? new Map()
  );
}
function optimisticallyPublish(snapshot: PublishedConfigSnapshot): void {
  queryClient.setQueryData<ItemConfigRegistrySnapshot>(
    itemConfigRegistryQueryOptions().queryKey,
    (prev) => {
      const next = new Map(prev?.publishedSnapshots ?? new Map());
      next.set(snapshot.configId, snapshot);
      return { publishedRegistry: prev?.publishedRegistry ?? [], publishedSnapshots: next };
    },
  );
}

export interface UseItemConfigPublishResult {
  saveAllChanged(targetIds?: ReadonlyArray<string>): Promise<SaveAllResult>;
  saveConfig(configId: string): Promise<SaveAllResult>;
  publishInFlight: boolean;
  publishProgress: PublishProgress;
}

export function useItemConfigPublish(
  account: ReadyAdminAccount | null,
): UseItemConfigPublishResult {
  const [publishInFlight, setPublishInFlight] = useState(false);
  const [publishProgress, setPublishProgress] = useState<PublishProgress>({ kind: "idle" });
  const showToast = useFeedbackStore((s) => s.showToast);

  const saveAllChanged = useCallback(
    async (targetIds?: ReadonlyArray<string>): Promise<SaveAllResult> => {
      const configs = useItemDraftsStore.getState().configs;
      const publishedSnapshots = readPublishedSnapshots();
      const dirtyIds = targetIds ?? dirtyConfigIds(configs, publishedSnapshots);

      // Demo mode: no chain publish — lift the current drafts into the
      // registry cache so the dirty diff goes green. (Ephemeral: the 60s
      // poll re-synthesizes from the seed, matching prior demo behavior.)
      if (isDemoMode()) {
        if (dirtyIds.length === 0) {
          setPublishProgress({ kind: "success", configIds: [] });
          return { ok: true, configIds: [] };
        }
        setPublishInFlight(true);
        publishStartToast(showToast);
        const done: string[] = [];
        try {
          const now = new Date().toISOString();
          for (let i = 0; i < dirtyIds.length; i += 1) {
            const configId = dirtyIds[i];
            if (configId == null) continue;
            setPublishProgress({ kind: "running", current: configId, remaining: dirtyIds.length - i });
            const config = configs.find((c) => c.id === configId);
            if (!config) continue;
            optimisticallyPublish({
              configId: config.id,
              cid: `bafydemo${config.id}-${now}`,
              size: 0,
              updatedAt: now,
              snapshot: config,
            });
            done.push(config.id);
          }
          publishSuccessToast(showToast, done.length);
          setPublishProgress({ kind: "success", configIds: done });
          return { ok: true, configIds: done };
        } finally {
          setPublishInFlight(false);
        }
      }

      if (account == null) {
        const error = { configId: "(none)", reason: "Wallet signer is not ready yet." };
        setPublishProgress({ kind: "error", configId: error.configId, reason: error.reason });
        showToast(error.reason, "warn");
        return { ok: false, error };
      }
      if (dirtyIds.length === 0) {
        setPublishProgress({ kind: "success", configIds: [] });
        return { ok: true, configIds: [] };
      }

      setPublishInFlight(true);
      publishStartToast(showToast);
      // Headline journey: number of dirty configs only — NO config ids
      // (operator-chosen strings may identify the merchant).
      journeyTracker.start("w3spay-admin:publish-item-configs", { "publish.count": dirtyIds.length });
      const done: string[] = [];
      try {
        for (let i = 0; i < dirtyIds.length; i += 1) {
          const configId = dirtyIds[i];
          if (configId == null) continue;
          setPublishProgress({ kind: "running", current: configId, remaining: dirtyIds.length - i });
          const config = configs.find((c) => c.id === configId);
          if (!config) continue;
          try {
            const result = await withSpan(
              "w3spay-admin:bulletin.publish.item-config",
              "bulletin.publish",
              () =>
                publishItemConfig({
                  config,
                  productAccountPublicKey: account.productAccount.publicKey,
                  nowIso: new Date().toISOString(),
                }),
              { "publish.size_bytes": 0 },
            );
            const idx = i < 100 ? String(i) : "99+";
            journeyTracker.milestone("w3spay-admin:publish-item-configs", `bulletin-uploaded:${idx}`, {
              "publish.size_bytes": result.size,
            });
            await upsertItemConfig({
              context: contextFor(account),
              payload: { configId: config.id, cid: result.cid, size: result.size },
              onStatus: (status) => publishStatusToast(showToast, status),
            });
            journeyTracker.milestone("w3spay-admin:publish-item-configs", `registry-upserted:${idx}`);
            optimisticallyPublish({
              configId: config.id,
              cid: result.cid,
              size: result.size,
              updatedAt: result.envelope.publishedAt,
              snapshot: result.envelope.config,
            });
            done.push(config.id);
          } catch (caught) {
            journeyTracker.fail("w3spay-admin:publish-item-configs", categorizePublishError(caught), caught);
            const reason = caught instanceof Error ? caught.message : String(caught);
            setPublishProgress({ kind: "error", configId, reason });
            publishFailureToast(showToast, reason);
            return { ok: false, error: { configId, reason } };
          }
        }
        setPublishProgress({ kind: "success", configIds: done });
        publishSuccessToast(showToast, done.length);
        journeyTracker.complete("w3spay-admin:publish-item-configs", { "publish.completed": done.length });
        // Reconcile the optimistic cache against the chain enumeration.
        void queryClient.invalidateQueries({ queryKey: queryRoots.itemConfigRegistry });
        return { ok: true, configIds: done };
      } finally {
        setPublishInFlight(false);
      }
    },
    [account, showToast],
  );

  const saveConfig = useCallback(
    (configId: string): Promise<SaveAllResult> => saveAllChanged([configId]),
    [saveAllChanged],
  );

  return { saveAllChanged, saveConfig, publishInFlight, publishProgress };
}
