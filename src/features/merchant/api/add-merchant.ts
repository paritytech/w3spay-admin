import type { AccountId32Hex } from "@shared/utils/address.ts";
import type { TxStatus } from "@/shared/api/contracts";
import {
  makeMerchantEffectOracle,
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "@shared/api/merchant-registry-write.ts";

export interface AddMerchantPayload {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
  readonly displayName: string;
}

export async function addMerchant(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: AddMerchantPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "registerMerchant",
    args: [
      payload.merchantId,
      payload.terminalId,
      payload.destinationAccountId,
      payload.displayName,
    ],
    onStatus,
    // Inclusion oracle: `registerMerchant` creates the entry. We require
    // the new destination + displayName to match too, so a concurrent
    // unrelated mutation against the same key (extremely unlikely) does
    // not falsely satisfy. Dry-run reverts when the merchant already
    // exists, so the pre-state has `exists === false`.
    waitForChainEffect: makeMerchantEffectOracle(
      context,
      payload.merchantId,
      payload.terminalId,
      (entry) =>
        entry.exists &&
        entry.displayName === payload.displayName &&
        entry.destinationAccountId.toLowerCase() ===
          payload.destinationAccountId.toLowerCase(),
    ),
  });
}
