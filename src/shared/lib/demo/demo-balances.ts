/**
 * Deterministic synthetic token balances for demo mode.
 *
 * Hashes the AccountId32 hex bytes via a small FNV-1a-style mixer and
 * maps the result to a plausible-looking planck amount (`0` …
 * `~10_000 CASH`). Stable across reloads because it only depends on the
 * address — two demo sessions of the same fixture set produce the same
 * Balances tab.
 *
 * Lives in `lib/demo/` rather than `contract/token-balance.ts` so the
 * chain-bound balance code stays free of demo branching internally —
 * the hook calls `getDemoTokenBalance` directly when `isDemoMode()`
 * is true.
 */
import { envConfig } from "@shared/config";
import { type AccountId32Hex } from "@shared/lib/address.ts";

/**
 * Max synthetic balance (in whole tokens) any single demo merchant
 * ever shows. Kept under 10_000 so the Balances total reads as a
 * believable pilot scale.
 */
const MAX_WHOLE_TOKENS = 9_999;

/**
 * Hash an AccountId32Hex into a 32-bit unsigned integer using a tiny
 * FNV-1a variant. Sufficient avalanche for "pick a stable balance" —
 * no security claim.
 */
function hashHex(hex: AccountId32Hex): number {
  let h = 0x811c9dc5; // FNV offset basis
  // Skip the leading "0x".
  for (let i = 2; i < hex.length; i += 1) {
    h = Math.imul(h ^ hex.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic synthetic balance for `accountId32`, in **planck**
 * (smallest unit, matching `envConfig.token.decimals`).
 *
 * The hash is split into a whole-token slot and a fractional slot so
 * the rendered amount looks like a real balance (e.g. `1234.567890`)
 * rather than a round integer.
 */
export function getDemoTokenBalance(accountId32: AccountId32Hex): bigint {
  const h = hashHex(accountId32);
  const whole = BigInt(h % (MAX_WHOLE_TOKENS + 1));
  // Use a second mix for the fractional part so the two halves are not
  // correlated against each other when sorted.
  const fracMix = Math.imul(h, 0x9e3779b1) >>> 0;
  const scale = 10n ** BigInt(envConfig.token.decimals);
  const frac = BigInt(fracMix) % scale;
  return whole * scale + frac;
}
