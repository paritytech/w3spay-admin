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

export interface UpsertProcessorConfigPayload {
  readonly groupId: string;
  readonly cid: string;
  readonly size: number;
}

export interface RemoveProcessorConfigPayload {
  readonly groupId: string;
}

/**
 * Decoded shape of the `ProcessorConfigRecord` struct returned by the
 * registry's `getProcessorConfig(groupId)` view. Mirrors the Solidity tuple
 * in `W3SPayRegistry.sol`.
 */
export interface ProcessorConfigRecord {
  readonly groupId: string;
  readonly cid: string;
  readonly size: number;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

/**
 * Same shape as `makeMerchantEffectOracle` (in `merchant-registry-write.ts`)
 * but reads `getProcessorConfig(groupId)`. Kept local because processor-config
 * writes are the only consumer.
 */
function makeProcessorConfigEffectOracle(
  context: MerchantRegistryWriteContext,
  groupId: string,
  matches: (entry: ProcessorConfigRecord) => boolean,
): ChainEffectOracle {
  const address = resolveRegistryAddress(context.registryAddress);
  return async () => {
    const [entry] = await readContract<readonly [ProcessorConfigRecord]>(useMainClient().client, {
      address,
      abi: W3SPayRegistryABI,
      functionName: "getProcessorConfig",
      args: [groupId],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    });
    return matches(entry);
  };
}

export async function upsertProcessorConfig(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: UpsertProcessorConfigPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "upsertProcessorConfig",
    args: [payload.groupId, payload.cid, payload.size],
    onStatus,
    // Inclusion oracle: the record exists and its CID + size match the new
    // values. Covers both insert and update.
    waitForChainEffect: makeProcessorConfigEffectOracle(
      context,
      payload.groupId,
      (entry) => entry.exists && entry.cid === payload.cid && entry.size === payload.size,
    ),
  });
}

export async function removeProcessorConfig(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: RemoveProcessorConfigPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "removeProcessorConfig",
    args: [payload.groupId],
    onStatus,
    waitForChainEffect: makeProcessorConfigEffectOracle(
      context,
      payload.groupId,
      (entry) => !entry.exists,
    ),
  });
}
