/**
 * Toast wiring for the Items-tab "Save & publish" flow.
 *
 * Mirrors the merchant-write loading model: a persistent spinner toast
 * tracks the in-flight submission (Bulletin upload → chain `upsertItemConfig`),
 * then a terminal success/failure toast replaces it once the batch settles.
 * The spinner toast carries `durationMs: null` so it never auto-dismisses
 * while the transaction is broadcasting.
 */

import { showTransactionToast, type TransactionToast } from "@shared/utils/transaction-toast.ts";
import type { TxStatus } from "@/shared/chain/contracts";

export function publishStartToast(onToast: TransactionToast): void {
  onToast("Publishing item configs…", "ok", { loading: true, durationMs: null });
}

export function publishStatusToast(onToast: TransactionToast, status: TxStatus): void {
  showTransactionToast(onToast, status);
}

export function publishSuccessToast(onToast: TransactionToast, count: number): void {
  onToast(`Published ${count} item config${count === 1 ? "" : "s"}`);
}

export function publishFailureToast(onToast: TransactionToast, reason: string): void {
  onToast(`Publish failed: ${reason}`, "warn");
}
