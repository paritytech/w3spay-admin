// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";
import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";

interface RawProcessorConfigRecord {
  readonly groupId: string;
  readonly cid: string;
  readonly size: number;
  readonly updatedAt: bigint;
  readonly exists: boolean;
}

export interface ProcessorConfigRegistryRecord {
  readonly groupId: string;
  readonly cid: string;
  readonly size: number;
  /** ISO timestamp; converted from unix seconds. */
  readonly updatedAt: string;
}

/**
 * List every processor-config CID record currently published on the registry
 * contract, in chain enumeration order. Returns `[]` when the contract has no
 * records. Mirrors `listItemConfigRecords`.
 */
export async function listProcessorConfigRecords(
  registryAddress: `0x${string}` = resolveRegistryAddress(),
): Promise<ReadonlyArray<ProcessorConfigRegistryRecord>> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const ids = await readContract<readonly string[]>(client, {
    address: registryAddress,
    abi: W3SPayRegistryABI,
    functionName: "getAllProcessorConfigIds",
    origin,
    at: "best",
  });

  const records = await Promise.all(
    ids.map(async (groupId) => {
      const [entry] = await readContract<[RawProcessorConfigRecord]>(client, {
        address: registryAddress,
        abi: W3SPayRegistryABI,
        functionName: "getProcessorConfig",
        args: [groupId],
        origin,
        at: "best",
      });
      return entry.exists
        ? {
            groupId: entry.groupId,
            cid: entry.cid,
            size: entry.size,
            updatedAt: new Date(Number(entry.updatedAt) * 1_000).toISOString(),
          }
        : null;
    }),
  );

  return records.filter((row): row is ProcessorConfigRegistryRecord => row !== null);
}
