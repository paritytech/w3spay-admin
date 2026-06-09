// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";

import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import type { MerchantLifecycle, RegistryMerchantRow } from "@features/merchant/merchant-model.ts";
import type { AccountId32Hex } from "@shared/lib/address.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";

interface RawMerchantEntry {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
  readonly displayName: string;
  readonly status: number;
  readonly addedAt: bigint;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

export async function listMerchantEntries(
  registryAddress: `0x${string}` = resolveRegistryAddress(),
): Promise<ReadonlyArray<RegistryMerchantRow>> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const keys = await readContract<readonly `0x${string}`[]>(client, {
    address: registryAddress,
    abi: W3SPayRegistryABI,
    functionName: "getAllTerminalKeys",
    origin,
    at: "best",
  });

  const rows = await Promise.all(
    keys.map(async (key) => {
      const [entry] = await readContract<[RawMerchantEntry]>(client, {
        address: registryAddress,
        abi: W3SPayRegistryABI,
        functionName: "getMerchantByKey",
        args: [key],
        origin,
        at: "best",
      });
      return entry.exists ? rowFromEntry(key, entry) : null;
    }),
  );

  return rows.filter((row): row is RegistryMerchantRow => row != null);
}

export function rowFromEntry(key: string, entry: RawMerchantEntry): RegistryMerchantRow {
  return {
    key,
    merchantId: entry.merchantId,
    terminalId: entry.terminalId,
    destinationAccountId: entry.destinationAccountId.toLowerCase() as AccountId32Hex,
    displayName: entry.displayName,
    status: merchantStatusFromContract(entry.status),
    createdAt: unixSecondsToIso(entry.addedAt),
    updatedAt: unixSecondsToIso(entry.updatedAt),
  };
}

function merchantStatusFromContract(status: number): MerchantLifecycle {
  if (status === 0) return "active";
  if (status === 1) return "paused";
  if (status === 2) return "revoked";
  throw new Error(`unknown merchant status ${status}`);
}

function unixSecondsToIso(value: bigint): string {
  return new Date(Number(value) * 1_000).toISOString();
}
