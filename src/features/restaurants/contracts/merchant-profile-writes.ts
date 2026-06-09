// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { envConfig } from "@/config";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import {
  resolveRegistryAddress,
  writeMerchantRegistry,
  type MerchantRegistryWriteContext,
} from "@shared/chain/merchant-registry-write.ts";
import { useMainClient } from "@shared/chain/client.ts";
import { readContract } from "@shared/chain/contracts/read.ts";
import type { ChainEffectOracle, TxStatus } from "@shared/chain/contracts/watch-transaction.ts";

export interface UpsertMerchantProfilePayload {
  readonly groupId: string;
  readonly merchantName: string;
  readonly merchantId: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phone: string;
  readonly taxId: string;
}

export interface RemoveMerchantProfilePayload {
  readonly groupId: string;
}

/**
 * Decoded shape of the `MerchantProfile` struct returned by the registry's
 * `getMerchantProfile(groupId)` view. Mirrors the Solidity tuple in
 * `W3SPayRegistry.sol`. The user-facing "restaurant" model maps onto this.
 */
export interface MerchantProfileRecord {
  readonly groupId: string;
  readonly merchantName: string;
  readonly merchantId: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly phone: string;
  readonly taxId: string;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

function makeMerchantProfileEffectOracle(
  context: MerchantRegistryWriteContext,
  groupId: string,
  matches: (entry: MerchantProfileRecord) => boolean,
): ChainEffectOracle {
  const address = resolveRegistryAddress(context.registryAddress);
  return async () => {
    const [entry] = await readContract<readonly [MerchantProfileRecord]>(useMainClient().client, {
      address,
      abi: W3SPayRegistryABI,
      functionName: "getMerchantProfile",
      args: [groupId],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    });
    return matches(entry);
  };
}

export async function upsertMerchantProfile(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: UpsertMerchantProfilePayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "upsertMerchantProfile",
    args: [
      payload.groupId,
      payload.merchantName,
      payload.merchantId,
      payload.addressLine1,
      payload.addressLine2,
      payload.phone,
      payload.taxId,
    ],
    onStatus,
    // Inclusion oracle: the profile exists and its merchantName matches the
    // new value. Covers both insert and update.
    waitForChainEffect: makeMerchantProfileEffectOracle(
      context,
      payload.groupId,
      (entry) => entry.exists && entry.merchantName === payload.merchantName,
    ),
  });
}

export async function removeMerchantProfile(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: RemoveMerchantProfilePayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "removeMerchantProfile",
    args: [payload.groupId],
    onStatus,
    waitForChainEffect: makeMerchantProfileEffectOracle(
      context,
      payload.groupId,
      (entry) => !entry.exists,
    ),
  });
}
