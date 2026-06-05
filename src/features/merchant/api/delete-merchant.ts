import type { TxStatus } from "@/shared/api/contracts";
import {
  makeMerchantEffectOracle,
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "@shared/api/merchant-registry-write.ts";

export interface DeleteMerchantPayload {
  readonly merchantId: string;
  readonly terminalId: string;
}

export async function deleteMerchant(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: DeleteMerchantPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "removeMerchant",
    args: [payload.merchantId, payload.terminalId],
    onStatus,
    // Inclusion oracle: `removeMerchant` flips the entry's `exists` field
    // false. The dry-run reverts when the merchant doesn't exist, so this
    // oracle is only polled when the pre-state had `exists === true` —
    // i.e. no trivial satisfaction.
    waitForChainEffect: makeMerchantEffectOracle(
      context,
      payload.merchantId,
      payload.terminalId,
      (entry) => !entry.exists,
    ),
  });
}

export const removeMerchant = deleteMerchant;
