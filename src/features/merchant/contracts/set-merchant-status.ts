import type { MerchantLifecycle } from "@features/merchant/merchant-model.ts";
import type { TxStatus } from "@/shared/chain/contracts";
import {
  makeMerchantEffectOracle,
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "@shared/chain/merchant-registry-write.ts";

const MERCHANT_STATUS_TO_CONTRACT: Record<MerchantLifecycle, 0 | 1 | 2> = {
  active: 0,
  paused: 1,
  revoked: 2,
};

export interface SetMerchantStatusPayload {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly status: MerchantLifecycle;
}

export async function setMerchantStatus(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: SetMerchantStatusPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  const target = MERCHANT_STATUS_TO_CONTRACT[payload.status];
  return writeMerchantRegistry({
    context,
    functionName: "setMerchantStatus",
    args: [payload.merchantId, payload.terminalId, target],
    onStatus,
    // Inclusion oracle: the entry's `status` enum matches the requested
    // value. The contract reverts a no-op status flip (`status === new`),
    // so the pre-state can't trivially satisfy.
    waitForChainEffect: makeMerchantEffectOracle(
      context,
      payload.merchantId,
      payload.terminalId,
      (entry) => entry.exists && entry.status === target,
    ),
  });
}
