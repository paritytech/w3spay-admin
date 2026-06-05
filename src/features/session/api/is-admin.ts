/**
 * `checkIsAdmin` — pure on-chain read of the registry's `isAdmin(address)`
 * view, plus the state types the gate consumes.
 *
 * The former `useIsAdmin` React hook is gone: the admin check is now a
 * TanStack Query (`lib/query/is-admin-query.ts`) so loaders and the gate
 * read the same cached result. This module owns the pure read + the
 * `IsAdminState` / `UseIsAdminResult` contract; the query module adapts a
 * `useQuery` result into that contract for `resolveAccessVariant`.
 */

import { readContract } from "@/shared/api/contracts";

import { envConfig } from "@shared/config.ts";
import { useMainClient } from "@shared/api/use-client.ts";
import { withTimeout } from "@shared/utils/with-timeout.ts";
import { normalizeH160Address } from "@shared/utils/address.ts";
import { W3SPayMerchantRegistryABI } from "@shared/api/registry-abi.ts";

const CHECK_TIMEOUT_MS = 60_000;

export type IsAdminState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "granted" }
  | { kind: "denied" }
  | { kind: "error"; reason: string };

export interface UseIsAdminResult {
  state: IsAdminState;
  /** True while a check is in flight. */
  inFlight: boolean;
  /** Convenience flag: latest check returned `true`. */
  granted: boolean;
  /** Re-run the on-chain check. */
  refresh(): Promise<void>;
}

/**
 * Resolve whether `adminH160` is an admin of the registry at
 * `registryAddress`. Wraps the dry-run `readContract` in a 60s timeout —
 * a wedged host transport otherwise leaves the gate spinning forever.
 *
 * `useMainClient()` is a process-wide singleton getter (despite the
 * `use` prefix), so this stays a plain async function callable from a
 * query's `queryFn`.
 */
export async function checkIsAdmin(
  adminH160: string,
  registryAddress: string,
): Promise<boolean> {
  const [granted] = await withTimeout(
    readContract<[boolean]>(useMainClient().client, {
      address: registryAddress.toLowerCase() as `0x${string}`,
      abi: W3SPayMerchantRegistryABI,
      functionName: "isAdmin",
      args: [normalizeH160Address(adminH160)],
      origin: envConfig.chain.readOnlyOrigin,
      at: "best",
    }),
    CHECK_TIMEOUT_MS,
    "registry isAdmin",
  );
  return granted;
}
