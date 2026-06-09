// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useCallback, useState } from "react";

import { normalizeMerchantDestinationInput } from "@shared/lib/address.ts";
import {
  computeTerminalKey,
  defaultT3rminalDisplayName,
  t3rminalTerminalIdForDestination,
  type AdminMerchant,
  type MerchantForm,
  type MerchantFormErrors,
  type MerchantKind,
} from "@features/merchant/merchant-model.ts";
import {
  type MerchantRegistryActions,
  type SubmitState,
  type UseMerchantWritesResult,
} from "@features/merchant/merchant-registry-types.ts";

import type { TxStatus } from "@/shared/chain/contracts";

import { journeyTracker } from "@shared/lib/telemetry.ts";
import { showTransactionToast, type TransactionToast } from "@shared/utils/transaction-toast.ts";

/** Categorical `chain.write.op` Sentry attribute — closed set mirroring `MerchantRegistryActions`. */
type WriteOp =
  | "register-merchant"
  | "set-status"
  | "delete-merchant"
  | "set-destination";

/**
 * Map a thrown write error onto a categorical telemetry label. Closed set keeps
 * the dashboard's `journey.failure_reason` filter stable; matching is best-effort
 * substring against the message.
 */
type WriteFailureCategory =
  | "user-rejected"
  | "dispatch-error"
  | "network"
  | "preflight"
  | "unknown";

function categorizeWriteError(caught: unknown): WriteFailureCategory {
  if (!(caught instanceof Error)) return "unknown";
  const msg = caught.message.toLowerCase();
  if (msg.includes("user rejected") || msg.includes("cancel") || msg.includes("rejected")) {
    return "user-rejected";
  }
  if (msg.includes("dispatch") || msg.includes("revert")) {
    return "dispatch-error";
  }
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) {
    return "network";
  }
  if (msg.includes("signer") || msg.includes("not ready")) {
    return "preflight";
  }
  return "unknown";
}

/**
 * Wrap the contract write's `onStatus` with the journey-milestone emitter,
 * forwarding every status unchanged so the UI state machine stays telemetry-unaware.
 * Only the four real statuses become milestones; the synthetic `preparing` / `idle`
 * / `error` are dropped because they're not timing-meaningful.
 */
function wrapOnStatusForJourney(
  inner: ((status: TxStatus) => void) | undefined,
): (status: TxStatus) => void {
  return (status) => {
    inner?.(status);
    if (
      status === "signing" ||
      status === "broadcasting" ||
      status === "in-block" ||
      status === "finalized"
    ) {
      journeyTracker.milestone("w3spay-admin:chain-write", status);
    }
  };
}

export function useMerchantWrites(options: {
  actions: MerchantRegistryActions | null;
  merchants: readonly AdminMerchant[];
  onToast: TransactionToast;
}): UseMerchantWritesResult {
  const { actions, merchants, onToast } = options;

  const [writeInFlight, setWriteInFlight] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const resetSubmit = useCallback(() => {
    setSubmitState("idle");
    setSubmitMessage(null);
  }, []);

  const registerMerchant = useCallback(async (
    form: MerchantForm,
    setErrors: (e: MerchantFormErrors) => void,
    kind: MerchantKind = "pos",
  ): Promise<string | null> => {
    if (actions == null) {
      setSubmitState("error");
      setSubmitMessage("Wallet signer is not ready yet.");
      return null;
    }

    const errs: MerchantFormErrors = {};
    const merchantId = form.merchantId.trim();
    const displayNameInput = form.displayName.trim();

    if (!merchantId) errs.merchantId = "Required.";

    let destinationAccountId: `0x${string}`;
    try {
      destinationAccountId = normalizeMerchantDestinationInput(form.destination.trim());
    } catch (caught) {
      errs.destination = caught instanceof Error ? caught.message : String(caught);
      destinationAccountId = "0x" as `0x${string}`;
    }

    let terminalId: string;
    if (kind === "t3rminal") {
      terminalId = destinationAccountId === "0x"
        ? ""
        : t3rminalTerminalIdForDestination(destinationAccountId);
    } else {
      terminalId = form.terminalId.trim();
      if (!terminalId) errs.terminalId = "Required.";
    }

    if (
      terminalId !== "" &&
      merchants.some((m) => m.terminalId === terminalId && m.merchantId === merchantId)
    ) {
      if (kind === "t3rminal") {
        errs.destination = "This T3rminal device is already registered under this merchant.";
      } else {
        errs.terminalId = "This (merchantId, terminalId) pair is already registered.";
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return null;
    }

    const displayName =
      displayNameInput !== ""
        ? displayNameInput
        : kind === "t3rminal"
          ? defaultT3rminalDisplayName(destinationAccountId)
          : "";

    setErrors({});
    setSubmitState("signing");
    setSubmitMessage(null);
    setWriteInFlight(true);
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "register-merchant" satisfies WriteOp });
    try {
      const txHash = await actions.registerMerchant(
        { merchantId, terminalId, destinationAccountId, displayName },
        wrapOnStatusForJourney((status) => {
          showTransactionToast(onToast, status);
          if (status === "broadcasting" || status === "in-block") {
            setSubmitState("submitting");
            setSubmitMessage(
              status === "broadcasting"
                ? "Broadcasting…"
                : "Included in block, waiting for finalization…",
            );
          } else if (status === "preparing") {
            setSubmitState("signing");
            setSubmitMessage("Preparing transaction…");
          } else if (status === "signing") {
            setSubmitState("signing");
            setSubmitMessage("Waiting for signature…");
          }
        }),
      );
      setSubmitState("finalized");
      setSubmitMessage(`Registered. Tx ${txHash || "(no hash)"}`);
      onToast(`Registered ${displayName || terminalId}`);
      journeyTracker.complete("w3spay-admin:chain-write");
      return computeTerminalKey(merchantId, terminalId);
    } catch (caught) {
      journeyTracker.fail("w3spay-admin:chain-write", categorizeWriteError(caught), caught);
      const reason = caught instanceof Error ? caught.message : String(caught);
      setSubmitState("error");
      setSubmitMessage(reason);
      onToast(`Register failed: ${reason}`, "warn");
      return null;
    } finally {
      setWriteInFlight(false);
    }
  }, [actions, merchants, onToast]);

  const setMerchantStatus = useCallback(async (
    merchant: AdminMerchant,
    action: "pause" | "resume" | "revoke" | "reinstate",
    target: "active" | "paused" | "revoked",
  ): Promise<void> => {
    if (actions == null) {
      onToast("Wallet signer is not ready.", "warn");
      return;
    }
    setWriteInFlight(true);
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "set-status" satisfies WriteOp });
    try {
      await actions.setMerchantStatus(
        { merchantId: merchant.merchantId, terminalId: merchant.terminalId, status: target },
        wrapOnStatusForJourney((status) => {
          showTransactionToast(onToast, status);
        }),
      );
      const label =
        action === "pause" ? "Paused"
        : action === "resume" ? "Resumed"
        : action === "revoke" ? "Revoked"
        : "Reinstated";
      onToast(`${label} ${merchant.name}`, action === "revoke" ? "warn" : "ok");
      journeyTracker.complete("w3spay-admin:chain-write");
    } catch (caught) {
      journeyTracker.fail("w3spay-admin:chain-write", categorizeWriteError(caught), caught);
      const reason = caught instanceof Error ? caught.message : String(caught);
      onToast(`Status update failed: ${reason}`, "warn");
    } finally {
      setWriteInFlight(false);
    }
  }, [actions, onToast]);

  const deleteMerchant = useCallback(async (
    merchant: AdminMerchant,
  ): Promise<boolean> => {
    if (actions == null) {
      onToast("Wallet signer is not ready.", "warn");
      return false;
    }
    setWriteInFlight(true);
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "delete-merchant" satisfies WriteOp });
    try {
      await actions.deleteMerchant(
        { merchantId: merchant.merchantId, terminalId: merchant.terminalId },
        wrapOnStatusForJourney((status) => {
          showTransactionToast(onToast, status);
        }),
      );
      // Deletion is permanent (row removed, not flagged), so the terminal toast
      // is `warn`-toned like revoke to stay distinct from a benign success.
      onToast(`Deleted ${merchant.name}`, "warn");
      journeyTracker.complete("w3spay-admin:chain-write");
      return true;
    } catch (caught) {
      journeyTracker.fail("w3spay-admin:chain-write", categorizeWriteError(caught), caught);
      const reason = caught instanceof Error ? caught.message : String(caught);
      onToast(`Delete failed: ${reason}`, "warn");
      return false;
    } finally {
      setWriteInFlight(false);
    }
  }, [actions, onToast]);

  const setMerchantDestination = useCallback(async (
    merchant: AdminMerchant,
    destinationInput: string,
    setError: (message: string | null) => void,
  ): Promise<boolean> => {
    if (actions == null) {
      setError(null);
      setSubmitState("error");
      setSubmitMessage("Wallet signer is not ready yet.");
      return false;
    }

    let destinationAccountId: `0x${string}`;
    try {
      destinationAccountId = normalizeMerchantDestinationInput(destinationInput.trim());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }

    if (destinationAccountId.toLowerCase() === merchant.destinationAccountId.toLowerCase()) {
      setError("That's already the current destination.");
      return false;
    }

    setError(null);
    setSubmitState("signing");
    setSubmitMessage(null);
    setWriteInFlight(true);
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "set-destination" satisfies WriteOp });
    try {
      const txHash = await actions.setMerchantDestination(
        {
          merchantId: merchant.merchantId,
          terminalId: merchant.terminalId,
          destinationAccountId,
        },
        wrapOnStatusForJourney((status) => {
          showTransactionToast(onToast, status);
          if (status === "broadcasting" || status === "in-block") {
            setSubmitState("submitting");
            setSubmitMessage(
              status === "broadcasting"
                ? "Broadcasting…"
                : "Included in block, waiting for finalization…",
            );
          } else if (status === "preparing") {
            setSubmitState("signing");
            setSubmitMessage("Preparing transaction…");
          } else if (status === "signing") {
            setSubmitState("signing");
            setSubmitMessage("Waiting for signature…");
          }
        }),
      );
      setSubmitState("finalized");
      setSubmitMessage(`Destination rotated. Tx ${txHash || "(no hash)"}`);
      onToast(`Rotated destination for ${merchant.name}`);
      journeyTracker.complete("w3spay-admin:chain-write");
      return true;
    } catch (caught) {
      journeyTracker.fail("w3spay-admin:chain-write", categorizeWriteError(caught), caught);
      const reason = caught instanceof Error ? caught.message : String(caught);
      setSubmitState("error");
      setSubmitMessage(reason);
      onToast(`Destination rotation failed: ${reason}`, "warn");
      return false;
    } finally {
      setWriteInFlight(false);
    }
  }, [actions, onToast]);

  return {
    writeInFlight,
    submitState,
    submitMessage,
    registerMerchant,
    setMerchantStatus,
    setMerchantDestination,
    deleteMerchant,
    resetSubmit,
  };
}
