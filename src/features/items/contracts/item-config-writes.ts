// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { ReadyAdminAccount } from "@features/session/account.ts";
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

export interface UpsertItemConfigPayload {
  readonly configId: string;
  readonly cid: string;
  readonly size: number;
}

export interface RemoveItemConfigPayload {
  readonly configId: string;
}

export interface UseItemConfigWritesOptions {
  readonly account: ReadyAdminAccount | null;
  readonly registryAddress?: string;
}

export interface ItemConfigWriteActions {
  upsert(payload: UpsertItemConfigPayload, onStatus?: (status: TxStatus) => void): Promise<`0x${string}`>;
  remove(payload: RemoveItemConfigPayload, onStatus?: (status: TxStatus) => void): Promise<`0x${string}`>;
}

/**
 * Decoded shape of the `ItemConfigRecord` struct returned by the
 * registry's `getItemConfig(configId)` view. Mirrors the Solidity tuple
 * in `W3SPayRegistry.sol`.
 *
 * Owned here (consumer location) per the project's `ts-no-return-type`
 * rule — callers import this named interface rather than deriving the
 * inferred `readContract` return type.
 */
export interface ItemConfigRecord {
  readonly configId: string;
  readonly cid: string;
  readonly size: number;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

export function contextFor(
  account: ReadyAdminAccount,
  registryAddress?: string,
): MerchantRegistryWriteContext {
  return {
    signer: account.signer,
    walletAddress: account.ss58Address,
    registryAddress,
  };
}

/**
 * Same shape as `makeMerchantEffectOracle` (in `merchant-registry-write.ts`)
 * but reads `getItemConfig(configId)` instead of `getMerchant(...)`. Kept
 * local because item-config writes are the only consumer.
 */
function makeItemConfigEffectOracle(
  context: MerchantRegistryWriteContext,
  configId: string,
  matches: (entry: ItemConfigRecord) => boolean,
): ChainEffectOracle {
  const address = resolveRegistryAddress(context.registryAddress);
  return async () => {
    const [entry] = await readContract<readonly [ItemConfigRecord]>(useMainClient().client, {
      address,
      abi: W3SPayRegistryABI,
      functionName: "getItemConfig",
      args: [configId],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    });
    return matches(entry);
  };
}

export async function upsertItemConfig(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: UpsertItemConfigPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "upsertItemConfig",
    args: [payload.configId, payload.cid, payload.size],
    onStatus,
    // Inclusion oracle: the entry exists and its CID + size match the
    // new values. Covers both insert and update — for a no-op rewrite
    // (CID + size already match) the contract still bumps `updatedAt`
    // but the predicate is trivially satisfied; that's acceptable since
    // a no-op write is a no-op outcome from the user's perspective.
    waitForChainEffect: makeItemConfigEffectOracle(
      context,
      payload.configId,
      (entry) =>
        entry.exists &&
        entry.cid === payload.cid &&
        entry.size === payload.size,
    ),
  });
}

export async function removeItemConfig(options: {
  readonly context: MerchantRegistryWriteContext;
  readonly payload: RemoveItemConfigPayload;
  readonly onStatus?: (status: TxStatus) => void;
}): Promise<`0x${string}`> {
  const { context, payload, onStatus } = options;
  return writeMerchantRegistry({
    context,
    functionName: "removeItemConfig",
    args: [payload.configId],
    onStatus,
    waitForChainEffect: makeItemConfigEffectOracle(
      context,
      payload.configId,
      (entry) => !entry.exists,
    ),
  });
}
