/**
 * Merchant-registry write surface.
 *
 * Composes the account-bound mutations (`useMerchantActions`, which
 * invalidate the registry query on success) with the write-lifecycle
 * hook (`useMerchantWrites`). `canWrite` reflects whether the signed-in
 * account can submit registry writes.
 *
 * Each write screen mounts its own instance. The write screens are
 * distinct routes (never mounted together) and invalidation flows
 * through the shared TanStack Query cache, so per-screen lifecycle state
 * matches the prior single-provider behavior exactly.
 */

import { useMerchantActions } from "./merchant-mutations.ts";
import { useMerchantWrites } from "./use-merchant-writes.ts";
import { useMerchants } from "./use-merchants.ts";
import type { UseMerchantWritesResult } from "@features/merchant/merchant-registry-types.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

export interface UseMerchantWriteOpsResult {
  readonly writes: UseMerchantWritesResult;
  /** True when the signed-in account can submit registry writes. */
  readonly canWrite: boolean;
}

export function useMerchantWriteOps(): UseMerchantWriteOpsResult {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const showToast = useFeedbackStore((s) => s.showToast);
  const { merchants } = useMerchants();
  const actions = useMerchantActions(readyAccount);
  const writes = useMerchantWrites({ actions, merchants, onToast: showToast });
  return { writes, canWrite: actions != null };
}

/**
 * Lightweight probe for write capability without spinning up the full
 * write-lifecycle state (used by read-mostly surfaces like the merchant
 * payout block).
 */
export function useCanWriteMerchants(): boolean {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return useMerchantActions(readyAccount) != null;
}
