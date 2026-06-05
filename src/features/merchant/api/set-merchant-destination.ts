import type { AccountId32Hex } from "@shared/utils/address.ts";
import type { TxStatus } from "@/shared/api/contracts";
import {
  makeMerchantEffectOracle,
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "@shared/api/merchant-registry-write.ts";

/**
 * Payload for the dedicated "rotate payout destination" path.
 *
 * Distinct from `UpdateMerchantPayload` because that one also rewrites
 * `displayName` — admins rotating an address shouldn't have to know the
 * current name (or risk wiping it). The contract has a matching
 * `setMerchantDestination` function and `MerchantDestinationChanged`
 * event for exactly this case.
 */
export interface SetMerchantDestinationPayload {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
}

export async function setMerchantDestination(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: SetMerchantDestinationPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "setMerchantDestination",
    args: [payload.merchantId, payload.terminalId, payload.destinationAccountId],
    onStatus,
    // Inclusion oracle: the entry's destination matches the new value.
    // displayName is intentionally unchecked — the contract preserves it
    // here, so a partial match against the new destination alone is the
    // signal we want.
    waitForChainEffect: makeMerchantEffectOracle(
      context,
      payload.merchantId,
      payload.terminalId,
      (entry) =>
        entry.exists &&
        entry.destinationAccountId.toLowerCase() ===
          payload.destinationAccountId.toLowerCase(),
    ),
  });
}
