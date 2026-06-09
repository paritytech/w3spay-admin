// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";
import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";

interface RawItemConfigRecord {
  readonly configId: string;
  readonly cid: string;
  readonly size: number;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

export interface ItemConfigRegistryRecord {
  readonly configId: string;
  readonly cid: string;
  readonly size: number;
  /** ISO timestamp; converted from unix seconds. */
  readonly updatedAt: string;
}

/**
 * List every item-config CID record currently published on the
 * registry contract, in chain enumeration order. Returns `[]` when the
 * contract has no records.
 */
export async function listItemConfigRecords(
  registryAddress: `0x${string}` = resolveRegistryAddress(),
): Promise<ReadonlyArray<ItemConfigRegistryRecord>> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const ids = await readContract<readonly string[]>(client, {
    address: registryAddress,
    abi: W3SPayRegistryABI,
    functionName: "getAllItemConfigIds",
    origin,
    at: "best",
  });

  const records = await Promise.all(
    ids.map(async (configId) => {
      const [entry] = await readContract<[RawItemConfigRecord]>(client, {
        address: registryAddress,
        abi: W3SPayRegistryABI,
        functionName: "getItemConfig",
        args: [configId],
        origin,
        at: "best",
      });
      return entry.exists ? toItemConfigRecord(entry) : null;
    }),
  );

  return records.filter((row): row is ItemConfigRegistryRecord => row !== null);
}

function toItemConfigRecord(raw: RawItemConfigRecord): ItemConfigRegistryRecord {
  return {
    configId: raw.configId,
    cid: raw.cid,
    size: raw.size,
    updatedAt: unixSecondsToIso(raw.updatedAt),
  };
}

function unixSecondsToIso(value: bigint): string {
  return new Date(Number(value) * 1_000).toISOString();
}
