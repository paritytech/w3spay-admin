/**
 * Token balance lookup on the People-system parachain (Paseo Individuality).
 *
 * The token (CASH by default; see `src/config.ts`) is NOT a pallet-revive
 * contract: there is no EVM on People. It lives on `pallet-assets`, keyed
 * by an XCM V5 Location. The equivalent of an ERC-20 `balanceOf(address)`
 * is the `Assets.Account(<location>, <ss58>)` storage map, which returns
 * `Option<AssetAccount { balance, status, reason }>`.
 *
 * This module is the pure read + formatting layer. The caching + React
 * surface (`useTokenBalances`) now lives in `lib/query/balance-queries.ts`
 * as a TanStack Query — the query cache replaces the former in-memory
 * `balanceCache` Map.
 */

import { envConfig } from "@shared/config.ts";
import { accountId32HexToSs58, type AccountId32Hex } from "@shared/utils/address.ts";
import { usePeopleClient } from "@shared/api/client.ts";

/** Storage shape for `Assets.Account` on Paseo Individuality. */
interface AssetAccount {
  readonly balance: bigint;
}

/** Narrow the untyped `unsafeApi.query.Assets.Account` surface. */
interface AssetsQueryShim {
  readonly Assets: {
    readonly Account: {
      getValue(
        location: typeof envConfig.token.location,
        ss58: string,
        opts?: { at?: "best" | "finalized" },
      ): Promise<AssetAccount | undefined>;
    };
  };
}

export class PeopleChainUnavailableError extends Error {
  constructor() {
    super("People chain client is not configured for the active network.");
    this.name = "PeopleChainUnavailableError";
  }
}

/**
 * Fetch one merchant's token balance, in planck (smallest unit).
 *
 * Returns `0n` when the merchant has no `Assets.Account` row (never held
 * the token) so callers can render "0.00 CASH" without branching on missing
 * rows.
 *
 * Throws `PeopleChainUnavailableError` when the active network has no people
 * chain — that's a config problem, not a per-merchant fact, so the Balances
 * tab can surface it once instead of per row.
 */
export async function fetchTokenBalance(
  accountId32: AccountId32Hex,
  at: "best" | "finalized" = "best",
): Promise<bigint> {
  const client = usePeopleClient();
  if (client == null) throw new PeopleChainUnavailableError();
  const ss58 = accountId32HexToSs58(accountId32);
  const query = client.unsafeApi.query as unknown as AssetsQueryShim;
  const account = await query.Assets.Account.getValue(envConfig.token.location, ss58, { at });
  return account?.balance ?? 0n;
}

/** Default poll/refetch interval: 60s. Balances rarely move mid-session. */
export const TOKEN_BALANCE_TTL_MS = 60_000;

export type BalanceLoadState = "idle" | "loading" | "ready" | "error";

export interface UseTokenBalancesResult {
  readonly balances: ReadonlyMap<AccountId32Hex, bigint>;
  readonly state: BalanceLoadState;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
  readonly refreshOne: (accountId32: AccountId32Hex) => Promise<void>;
}

// ─── Formatting ───────────────────────────────────────────────────────────

const TOKEN_SCALE = 10n ** BigInt(envConfig.token.decimals);

/**
 * Format a token planck amount as a decimal string with `TOKEN_DECIMALS`
 * digits. Returns `"—"` for unknown balances so the table can render
 * uniformly.
 */
export function formatTokenAmount(planck: bigint | undefined): string {
  if (planck == null) return "—";
  const whole = planck / TOKEN_SCALE;
  const fraction = planck % TOKEN_SCALE;
  const fractionStr = fraction.toString().padStart(envConfig.token.decimals, "0");
  // Trim trailing zeros but keep at least 2 places for currency feel.
  const trimmed = fractionStr.replace(/0+$/, "");
  const padded = trimmed.length < 2 ? trimmed.padEnd(2, "0") : trimmed;
  return `${whole.toString()}.${padded}`;
}
