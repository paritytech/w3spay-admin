// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { readContract } from "@/shared/chain/contracts";

import { envConfig } from "@/config";
import { useMainClient } from "@shared/chain/use-client.ts";
import { withTimeout } from "@shared/utils/with-timeout.ts";
import { normalizeH160Address } from "@shared/lib/address.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";

const CHECK_TIMEOUT_MS = 60_000;

export type IsAdminState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "granted" }
  | { kind: "denied" }
  | { kind: "error"; reason: string };

export interface UseIsAdminResult {
  state: IsAdminState;
  inFlight: boolean;
  granted: boolean;
  refresh(): Promise<void>;
}

/**
 * Wraps the dry-run `readContract` in a 60s timeout — a wedged host transport
 * otherwise leaves the gate spinning forever. `useMainClient()` is a process-wide
 * singleton getter (despite the `use` prefix), so this stays a plain async
 * function callable from a query's `queryFn`.
 */
async function readRoleFlag(
  functionName: "isAdmin" | "isSuperAdmin",
  adminH160: string,
  registryAddress: string,
): Promise<boolean> {
  const [granted] = await withTimeout(
    readContract<[boolean]>(useMainClient().client, {
      address: registryAddress.toLowerCase() as `0x${string}`,
      abi: W3SPayRegistryABI,
      functionName,
      args: [normalizeH160Address(adminH160)],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    }),
    CHECK_TIMEOUT_MS,
    `registry ${functionName}`,
  );
  return granted;
}

export async function checkIsAdmin(
  adminH160: string,
  registryAddress: string,
): Promise<boolean> {
  return readRoleFlag("isAdmin", adminH160, registryAddress);
}

export async function checkIsSuperAdmin(
  adminH160: string,
  registryAddress: string,
): Promise<boolean> {
  return readRoleFlag("isSuperAdmin", adminH160, registryAddress);
}
