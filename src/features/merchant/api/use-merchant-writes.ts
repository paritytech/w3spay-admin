/**
 * `useMerchantWrites` — write-lifecycle hook for the merchant registry.
 *
 * Owns `writeInFlight`, `submitState`, `submitMessage` and exposes
 * add/status/destination callbacks for the merchant screens. The caller
 * handles navigation and form reset after the returned promise resolves.
 */

import { useCallback, useState } from "react";

import { normalizeMerchantDestinationInput } from "@shared/utils/address.ts";
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

import type { TxStatus } from "@/shared/api/contracts";

import { journeyTracker } from "@shared/utils/telemetry.ts";
import { showTransactionToast, type TransactionToast } from "@shared/utils/transaction-toast.ts";

/**
 * Categorical Sentry attribute for the write `op` — closed set
 * mirroring `MerchantRegistryActions`. Used as `chain.write.op` on
 * the chain-write journey root span.
 */
type WriteOp =
  | "register-merchant"
  | "set-status"
  | "delete-merchant"
  | "set-destination";

/**
 * Map a thrown write error onto the categorical telemetry label.
 * Closed set — keeps the dashboard's `journey.failure_reason` filter
 * stable. Matching is best-effort substring against the message;
 * unknown shapes default to `"unknown"`.
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
 * Wrap the `onStatus` callback the contract write expects with the
 * journey-milestone emitter. Forwards every status to the original
 * callback unchanged so the UI state machine stays unaware of
 * telemetry. The four real statuses (`signing`, `broadcasting`,
 * `in-block`, `finalized`) become journey milestones; the synthetic
 * `preparing` / `idle` / `error` are dropped because they're not
 * timing-meaningful (`preparing` runs before the user sees the
 * signing modal, `error` is captured by the catch branch).
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
      journeyTracker.milestone("chain-write", status);
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
    // Telemetry: open the chain-write journey before signing kicks
    // off; milestones fire from inside the wrapped `onStatus` below.
    journeyTracker.start("chain-write", { "chain.write.op": "register-merchant" satisfies WriteOp });
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
      journeyTracker.complete("chain-write");
      return computeTerminalKey(merchantId, terminalId);
    } catch (caught) {
      journeyTracker.fail("chain-write", categorizeWriteError(caught), caught);
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
    journeyTracker.start("chain-write", { "chain.write.op": "set-status" satisfies WriteOp });
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
      journeyTracker.complete("chain-write");
    } catch (caught) {
      journeyTracker.fail("chain-write", categorizeWriteError(caught), caught);
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
    journeyTracker.start("chain-write", { "chain.write.op": "delete-merchant" satisfies WriteOp });
    try {
      await actions.deleteMerchant(
        { merchantId: merchant.merchantId, terminalId: merchant.terminalId },
        wrapOnStatusForJourney((status) => {
          showTransactionToast(onToast, status);
        }),
      );
      // Deletion is permanent (the registry row is removed, not flagged), so
      // the terminal toast is `warn`-toned like revoke to keep it visually
      // distinct from a benign success.
      onToast(`Deleted ${merchant.name}`, "warn");
      journeyTracker.complete("chain-write");
      return true;
    } catch (caught) {
      journeyTracker.fail("chain-write", categorizeWriteError(caught), caught);
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
    journeyTracker.start("chain-write", { "chain.write.op": "set-destination" satisfies WriteOp });
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
      journeyTracker.complete("chain-write");
      return true;
    } catch (caught) {
      journeyTracker.fail("chain-write", categorizeWriteError(caught), caught);
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
