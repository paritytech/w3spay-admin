import type { ToastOptions } from "@shared/store/use-feedback-store.ts";
import type { TxStatus } from "@/shared/chain/contracts";

export type TransactionToast = (
  msg: string,
  tone?: "ok" | "warn",
  options?: ToastOptions,
) => void;

export function transactionToastMessage(status: TxStatus): string | null {
  if (status === "preparing") return "Preparing transaction…";
  if (status === "signing") return "Waiting for signature…";
  if (status === "broadcasting") return "Broadcasting transaction…";
  if (status === "in-block") return "Included in block, waiting for finalization…";
  return null;
}

export function showTransactionToast(onToast: TransactionToast, status: TxStatus): void {
  const message = transactionToastMessage(status);
  if (message == null) return;
  onToast(message, "ok", { loading: true, durationMs: null });
}
