/**
 * Host connection — w3spay-admin's local composition of `@/sdk`'s
 * shared host helpers, plus admin-only state:
 *
 *   - `connectToHost()` is re-exported from `@/sdk` (async, returns
 *     `boolean`, caches a `true` outcome, 15s timeout). The existing call
 *     sites in `use-product-account.ts` work unchanged.
 *   - `useHostWallet({ productIdentifier })` — the auto-initing host-wallet
 *     store from `@/sdk`. Now the single source of truth for
 *     connection state, product account, signer, and allowance claims.
 *   - `injectHostWallet()` / `claimResourceAllowances()` — the iOS
 *     Spektr-extension gate and resource-allowance claim helpers.
 *   - `isHostConnected()` — read the cached flag (post-handshake outcome).
 *   - `isDemoMode()` — admin-only feature flag that composes with
 *     `isInHost()` and `envConfig.features.demoMode`. Cached because
 *     the React tree branches on it; recomputing per-call could
 *     hook-order drift if anything ever mutated the environment
 *     mid-session.
 */

export {
  type HostEnvironment,
  type HostWalletSnapshot,
  type HostWalletState,
  type UseHostWalletOptions,
  type ResourceAllowanceKind,
  type ResourceAllowanceOutcome,
  type WalletPhase,
  detectHostEnvironment,
  isInHost,
  getAccountsProvider,
  isDevStandalone,
  isHostIOS,
  isIOS,
  connectToHost,
  isHostConnected,
  isHostWalletInjected,
  injectHostWallet,
  claimResourceAllowances,
  getResourceAllowanceOutcomes,
  requestCameraPermission,
  retryHostWallet,
  requestAccessHostWallet,
  useHostWallet,
  __resetHostConnectionForTests,
  __resetHostWalletForTests,
  __getHostWalletStateForTests,
} from "@shared/api/host";

import { isInHost } from "@shared/api/host";

import { envConfig } from "@shared/config.ts";

/**
 * Resolved-once **demo mode** flag.
 *
 * Demo mode runs the admin console with synthetic merchants, balances,
 * and a fake admin identity so a visitor outside a Polkadot host can walk
 * through every screen. Writes never touch chain — they mutate an
 * in-memory store. See `src/lib/demo/*` for the actual fixtures.
 *
 * Resolution:
 *   - `features.demoMode === "on"`     → always on.
 *   - `features.demoMode === "off"`    → always off.
 *   - `features.demoMode === "auto"`   → on when not inside a host.
 *
 * Cached at module init because the React tree branches on this value;
 * recomputing per-call would risk hook-order drift if anything ever
 * mutated the environment mid-session (it doesn't, but the cache makes
 * the invariant explicit).
 */
let demoModeCache: boolean | null = null;
export function isDemoMode(): boolean {
  if (demoModeCache !== null) return demoModeCache;
  const flag = envConfig.features.demoMode;
  if (flag === "on") demoModeCache = true;
  else if (flag === "off") demoModeCache = false;
  else demoModeCache = !isInHost();
  return demoModeCache;
}

/**
 * Test-only reset for `isDemoMode()`'s cache. Production code MUST NOT
 * call this — the flag's stability across a session is part of the
 * provider-level contract that keeps React hook order consistent.
 */
export function __resetDemoModeCacheForTests(): void {
  demoModeCache = null;
}
