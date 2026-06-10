// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useCallback, useState } from "react";

import { withSpan } from "@/shared/lib/sentry/index.ts";
import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import { journeyTracker } from "@shared/lib/telemetry.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

import {
  buildProcessorBundle,
  validateProcessorForm,
  type ProcessorConfigForm,
} from "../payment-processor-model.ts";
import { publishProcessorConfig } from "./processor-config-storage.ts";
import { removeProcessorConfig, upsertProcessorConfig } from "./processor-config-writes.ts";
import { useProcessorConfigCacheStore } from "../store/use-processor-config-cache.ts";
import {
  getDemoProcessorConfigs,
  setDemoProcessorConfigs,
} from "./processor-config-queries.ts";

export type ProcessorPublishResult =
  | { readonly ok: true; readonly groupId: string; readonly cid: string; readonly size: number }
  | { readonly ok: false; readonly reason: string };

export interface UseProcessorConfigPublishResult {
  publish(form: ProcessorConfigForm): Promise<ProcessorPublishResult>;
  readonly publishInFlight: boolean;
  readonly txStatus: TxStatus | null;
}

/**
 * Map a publish failure onto a categorical journey reason. Keeps
 * `journey.failure_reason` constrained to a closed set.
 */
function categorizePublishError(caught: unknown): string {
  if (!(caught instanceof Error)) return "unknown";
  const msg = caught.message.toLowerCase();
  if (msg.includes("not ready") || msg.includes("signer")) return "preflight";
  if (msg.includes("user rejected") || msg.includes("cancel")) return "user-rejected";
  if (msg.includes("host") || msg.includes("bulletin") || msg.includes("ipfs") || msg.includes("cid")) {
    return "bulletin";
  }
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) return "network";
  if (msg.includes("dispatch") || msg.includes("revert")) return "dispatch-error";
  return "unknown";
}

async function invalidateRegistry(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryRoots.processorConfigRegistry });
}

export function useProcessorConfigPublish(
  account: ReadyAdminAccount | null,
): UseProcessorConfigPublishResult {
  const [publishInFlight, setPublishInFlight] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const showToast = useFeedbackStore((s) => s.showToast);

  const publish = useCallback(
    async (form: ProcessorConfigForm): Promise<ProcessorPublishResult> => {
      const validationError = validateProcessorForm(form);
      if (validationError != null) {
        showToast(validationError, "warn");
        return { ok: false, reason: validationError };
      }
      const groupId = form.groupId.trim();

      // Demo mode: no bulletin upload, no chain write — snapshot a synthetic
      // record into the registry cache so the list reflects the publish.
      if (isDemoMode()) {
        setPublishInFlight(true);
        try {
          const cid = `bafydemo-${groupId}-${Date.now()}`;
          const next = getDemoProcessorConfigs().filter((r) => r.groupId !== groupId);
          setDemoProcessorConfigs([
            ...next,
            { groupId, cid, size: 0, updatedAt: new Date().toISOString() },
          ]);
          await invalidateRegistry();
          showToast(`Published config for ${groupId} (demo).`, "ok");
          return { ok: true, groupId, cid, size: 0 };
        } finally {
          setPublishInFlight(false);
        }
      }

      if (account == null) {
        const reason = "Sign in via the Polkadot host before publishing.";
        showToast(reason, "warn");
        return { ok: false, reason };
      }

      setPublishInFlight(true);
      journeyTracker.start("w3spay-admin:publish-processor-config", { "publish.terminals": form.terminals.length });
      try {
        const result = await withSpan(
          "w3spay-admin:bulletin.publish.processor-config",
          "bulletin.publish",
          () => publishProcessorConfig({ bundle: buildProcessorBundle(form), passkey: form.passkey }),
        );
        journeyTracker.milestone("w3spay-admin:publish-processor-config", "bulletin-uploaded", {
          "publish.size_bytes": result.size,
        });
        await upsertProcessorConfig({
          context: { signer: account.signer, walletAddress: account.ss58Address },
          payload: { groupId, cid: result.cid, size: result.size },
          onStatus: setTxStatus,
        });
        journeyTracker.complete("w3spay-admin:publish-processor-config", { "publish.size_bytes": result.size });
        await invalidateRegistry();
        showToast(`Published config for ${groupId}.`, "ok");
        return { ok: true, groupId, cid: result.cid, size: result.size };
      } catch (caught) {
        journeyTracker.fail("w3spay-admin:publish-processor-config", categorizePublishError(caught), caught);
        const reason = caught instanceof Error ? caught.message : String(caught);
        showToast(reason, "err");
        return { ok: false, reason };
      } finally {
        setPublishInFlight(false);
        setTxStatus(null);
      }
    },
    [account, showToast],
  );

  return { publish, publishInFlight, txStatus };
}

export type ProcessorDeleteResult =
  | { readonly ok: true; readonly groupId: string }
  | { readonly ok: false; readonly reason: string };

export interface UseProcessorConfigDeleteResult {
  remove(groupId: string): Promise<ProcessorDeleteResult>;
  readonly removeInFlight: boolean;
  readonly txStatus: TxStatus | null;
}

/**
 * Drop a payment-processor config from the registry. Demo mode edits the
 * in-memory registry only; real mode signs `removeProcessorConfig(groupId)` and
 * also clears the per-group local cache so re-opening the group later forces
 * the passkey gate (the previous terminals may be re-issued under a new
 * config — we don't want the editor to silently rehydrate stale ones).
 */
export function useProcessorConfigDelete(
  account: ReadyAdminAccount | null,
): UseProcessorConfigDeleteResult {
  const [removeInFlight, setRemoveInFlight] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const showToast = useFeedbackStore((s) => s.showToast);

  const remove = useCallback(
    async (groupId: string): Promise<ProcessorDeleteResult> => {
      const trimmed = groupId.trim();
      if (trimmed === "") {
        const reason = "Group ID is required.";
        showToast(reason, "warn");
        return { ok: false, reason };
      }

      if (isDemoMode()) {
        setRemoveInFlight(true);
        try {
          setDemoProcessorConfigs(
            getDemoProcessorConfigs().filter((r) => r.groupId !== trimmed),
          );
          useProcessorConfigCacheStore.getState().removeConfig(trimmed);
          await invalidateRegistry();
          showToast(`Deleted config for ${trimmed} (demo).`, "warn");
          return { ok: true, groupId: trimmed };
        } finally {
          setRemoveInFlight(false);
        }
      }

      if (account == null) {
        const reason = "Sign in via the Polkadot host before deleting.";
        showToast(reason, "warn");
        return { ok: false, reason };
      }

      setRemoveInFlight(true);
      journeyTracker.start("w3spay-admin:delete-processor-config", { "delete.groupId": trimmed });
      try {
        await removeProcessorConfig({
          context: { signer: account.signer, walletAddress: account.ss58Address },
          payload: { groupId: trimmed },
          onStatus: setTxStatus,
        });
        // Drop the local cache entry so a re-add starts from the passkey gate.
        useProcessorConfigCacheStore.getState().removeConfig(trimmed);
        await invalidateRegistry();
        // Deletion is permanent — `warn`-toned toast to stay distinct from a
        // benign success, matching the merchant-delete pattern.
        showToast(`Deleted config for ${trimmed}.`, "warn");
        journeyTracker.complete("w3spay-admin:delete-processor-config");
        return { ok: true, groupId: trimmed };
      } catch (caught) {
        journeyTracker.fail(
          "w3spay-admin:delete-processor-config",
          categorizePublishError(caught),
          caught,
        );
        const reason = caught instanceof Error ? caught.message : String(caught);
        showToast(reason, "err");
        return { ok: false, reason };
      } finally {
        setRemoveInFlight(false);
        setTxStatus(null);
      }
    },
    [account, showToast],
  );

  return { remove, removeInFlight, txStatus };
}