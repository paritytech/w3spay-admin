/**
 * Synthetic on-chain coordinates used in demo mode.
 *
 * Demo mode never deploys the `W3SPayMerchantRegistry` contract, so
 * `VITE_W3SPAY_REGISTRY_ADDRESS` is unset and `envConfig.contracts
 * .merchantRegistryAddress` resolves to the empty string. Surfaces that
 * still need *some* H160 (today: the Configure-T3rminal QR payload's
 * `registryAddress` field, which T3rminal devices echo back in their
 * encrypted reports) read through `resolveEffectiveRegistryAddress()`
 * so they receive an obviously-synthetic placeholder instead of `""`.
 *
 * A real T3rminal scanning a demo QR would not find this contract on
 * chain — that is expected: demo mode shows what the flow *looks like*
 * end-to-end, it does not produce live-usable artifacts.
 *
 * All other registry-reading paths (`useIsAdmin`,
 * `resolveRegistryAddress`, `useListMerchantEntries`) are bypassed by
 * the demo provider tree (`DemoAdminAccountProvider`,
 * `DemoMerchantContractProvider`) before they ever observe the empty
 * env value, so they intentionally do NOT call into this module.
 */
import type { H160Hex } from "@shared/lib/address.ts";

import { envConfig } from "@shared/config";
import { isDemoMode } from "./demo-mode.ts";

/**
 * Pinned synthetic H160 used wherever demo mode needs a non-empty
 * `merchantRegistryAddress`. Deliberately uses the `0xdead…` marker
 * pattern so any reviewer scanning a generated QR (or copying the
 * Registry row from the Configure-T3rminal screen) immediately
 * recognises it as a placeholder, not a deployed contract.
 *
 * Lowercase to match `normalizeH160Address()`'s output convention so
 * downstream string-equality checks on registry addresses stay stable
 * across demo and real paths.
 */
export const DEMO_REGISTRY_ADDRESS: H160Hex =
  "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead" as H160Hex;

/**
 * Resolve the registry H160 the current screen should embed in
 * artifacts (QR payloads, copy-to-clipboard rows). In demo mode this
 * is the synthetic placeholder; otherwise it is whatever the operator
 * configured in `VITE_W3SPAY_REGISTRY_ADDRESS`.
 *
 * Pure function — reads `envConfig` and `isDemoMode()`, both
 * module-cached singletons, so the result is stable across renders
 * for a given session.
 */
export function resolveEffectiveRegistryAddress(): string {
  if (isDemoMode()) return DEMO_REGISTRY_ADDRESS;
  return envConfig.contracts.merchantRegistryAddress;
}
