// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";
import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { resolveRegistryAddress } from "@shared/chain/merchant-registry-write.ts";
import type { MerchantProfileRecord } from "./merchant-profile-writes.ts";

/**
 * List every merchant-profile record currently published on the registry
 * contract, in chain enumeration order. Returns `[]` when the contract has no
 * records. Mirrors `listItemConfigRecords` (string-keyed enumeration).
 */
export async function listMerchantProfiles(
  registryAddress: `0x${string}` = resolveRegistryAddress(),
): Promise<ReadonlyArray<MerchantProfileRecord>> {
  const client = useMainClient().client;
  const origin = envConfig.chain.readOnlyOrigin;
  const ids = await readContract<readonly string[]>(client, {
    address: registryAddress,
    abi: W3SPayRegistryABI,
    functionName: "getAllMerchantProfileIds",
    origin,
    at: "best",
  });

  const records = await Promise.all(
    ids.map(async (groupId) => {
      const [entry] = await readContract<[MerchantProfileRecord]>(client, {
        address: registryAddress,
        abi: W3SPayRegistryABI,
        functionName: "getMerchantProfile",
        args: [groupId],
        origin,
        at: "best",
      });
      return entry.exists ? entry : null;
    }),
  );

  return records.filter((row): row is MerchantProfileRecord => row !== null);
}
