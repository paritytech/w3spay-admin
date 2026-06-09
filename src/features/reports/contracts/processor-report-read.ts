// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";
import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";

/** Decoded `getProcessorReport` tuple — mirrors the Solidity `ProcessorReportRecord`. */
interface RawProcessorReportRecord {
  readonly seq: bigint;
  readonly cid: string;
  readonly size: number;
  readonly committedAt: bigint;
  readonly exists: boolean;
}

export interface ProcessorReportIndexEntry {
  readonly seq: number;
  readonly cid: string;
  readonly size: number;
  /** ISO timestamp; converted from unix seconds. */
  readonly committedAt: string;
}

/**
 * List every Z report a processor group has published on the registry,
 * newest (highest seq) first. Returns `[]` when the group has none. Mirrors
 * `listProcessorConfigRecords`.
 */
export async function listProcessorReports(
  groupId: string,
  registryAddress: `0x${string}` = resolveRegistryAddress(),
): Promise<ReadonlyArray<ProcessorReportIndexEntry>> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const seqs = await readContract<readonly bigint[]>(client, {
    address: registryAddress,
    abi: W3SPayRegistryABI,
    functionName: "getProcessorReportSeqs",
    args: [groupId],
    origin,
    at: "best",
  });

  const records = await Promise.all(
    seqs.map(async (seq) => {
      const [entry] = await readContract<[RawProcessorReportRecord]>(client, {
        address: registryAddress,
        abi: W3SPayRegistryABI,
        functionName: "getProcessorReport",
        args: [groupId, seq],
        origin,
        at: "best",
      });
      return entry.exists
        ? {
            seq: Number(entry.seq),
            cid: entry.cid,
            size: entry.size,
            committedAt: new Date(Number(entry.committedAt) * 1_000).toISOString(),
          }
        : null;
    }),
  );

  return records
    .filter((row): row is ProcessorReportIndexEntry => row !== null)
    .sort((a, b) => b.seq - a.seq);
}
