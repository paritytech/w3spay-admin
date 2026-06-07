/**
 * Read item-config CID records from the merchant registry contract.
 *
 * The contract exposes per-configId records — `(configId, cid, size,
 * updatedAt, exists)` — and an enumeration of all known configIds. We
 * pull both together so the UI can render published configs without a
 * per-row round-trip.
 *
 * Errors propagate as thrown errors — the caller (the item-configs
 * hook) wraps them in a status object that flows into the Items tab.
 */

import { readContract } from "@/shared/chain/contracts";

import { envConfig } from "@shared/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { W3SPayMerchantRegistryABI } from "@shared/chain/registry-abi.ts";
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
    abi: W3SPayMerchantRegistryABI,
    functionName: "getAllItemConfigIds",
    origin,
    at: "best",
  });

  const records = await Promise.all(
    ids.map(async (configId) => {
      const [entry] = await readContract<[RawItemConfigRecord]>(client, {
        address: registryAddress,
        abi: W3SPayMerchantRegistryABI,
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
