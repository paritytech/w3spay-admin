// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { PolkadotSigner } from "polkadot-api";

import {
  readContract,
  writeContract,
  type ChainEffectOracle,
  type TxStatus,
} from "@/shared/chain/contracts/index.ts";
import { captureError, withSpan } from "@/shared/lib/sentry/index.ts";

import { envConfig } from "@/config.ts";
import { useMainClient } from "./use-client.ts";
import {
  normalizeH160Address,
  type AccountId32Hex,
  type H160Hex,
} from "@shared/lib/address.ts";
import { W3SPayRegistryABI } from "./registry-abi.ts";

export interface MerchantRegistryWriteContext {
  readonly signer: PolkadotSigner;
  /** SS58 wallet address used as the dry-run origin. */
  readonly walletAddress: string;
  readonly registryAddress?: string;
}

export interface MerchantEntry {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
  readonly displayName: string;
  /** Contract enum: 0=active, 1=paused, 2=revoked. */
  readonly status: number;
  readonly addedAt: bigint;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

export interface MerchantRegistryWriteOptions {
  readonly context: MerchantRegistryWriteContext;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly onStatus?: (status: TxStatus) => void;
  readonly waitForChainEffect?: ChainEffectOracle;
}

/**
 * Submit a write against the W3SPay merchant registry contract.
 *
 * Wraps `@/sdk/contracts`'s generic `writeContract` with:
 *   - the app's `useMainClient()` (so the SDK never reaches into app config)
 *   - a `withSpan` telemetry envelope tagged by the contract function name
 *     (categorical — closed set mirroring the registry write functions);
 *     NO arguments are recorded, so this never leaks merchant id /
 *     destination / status payloads.
 *   - a `captureError` hook on the rejection path so dry-run reverts
 *     and watchdog timeouts surface in Sentry without losing the
 *     function name context.
 */
export async function writeMerchantRegistry(
  options: MerchantRegistryWriteOptions,
): Promise<`0x${string}`> {
  const { context, functionName, args, onStatus, waitForChainEffect } = options;
  return withSpan(
    "w3spay-admin:revive.write",
    "chain.write",
    async () => {
      try {
        return await writeContract(useMainClient().client, {
          address: resolveRegistryAddress(context.registryAddress),
          abi: W3SPayRegistryABI,
          functionName,
          args,
          signer: context.signer,
          walletAddress: context.walletAddress,
          onStatus,
          waitForChainEffect,
        });
      } catch (caught) {
        captureError(caught, { subsystem: "revive", op: "write", fn: functionName });
        throw caught;
      }
    },
    { "chain.write.fn": functionName },
  );
}

export function resolveRegistryAddress(
  value: string = envConfig.contracts.merchantRegistryAddress,
): H160Hex {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error("VITE_W3SPAY_REGISTRY_ADDRESS is not configured.");
  }
  return normalizeH160Address(trimmed);
}

/**
 * Build a `ChainEffectOracle` that reads `getMerchant(merchantId, terminalId)`
 * on the registry and applies `matches` to the decoded entry. Each merchant
 * write op constructs one of these — `matches` encodes the post-state the
 * write is supposed to produce (e.g. for `removeMerchant`: `e => !e.exists`).
 */
export function makeMerchantEffectOracle(
  context: MerchantRegistryWriteContext,
  merchantId: string,
  terminalId: string,
  matches: (entry: MerchantEntry) => boolean,
): ChainEffectOracle {
  const address = resolveRegistryAddress(context.registryAddress);
  return async () => {
    const [entry] = await readContract<readonly [MerchantEntry]>(useMainClient().client, {
      address,
      abi: W3SPayRegistryABI,
      functionName: "getMerchant",
      args: [merchantId, terminalId],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    });
    return matches(entry);
  };
}
