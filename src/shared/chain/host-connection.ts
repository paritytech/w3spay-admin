// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

export {
  type HostEnvironment,
  type HostWalletSnapshot,
  type HostWalletState,
  type UseHostWalletOptions,
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
  requestCameraPermission,
  retryHostWallet,
  requestAccessHostWallet,
  useHostWallet,
  __resetHostConnectionForTests,
  __resetHostWalletForTests,
  __getHostWalletStateForTests,
} from "@shared/chain/host";

import { isInHost } from "@shared/chain/host";

import { envConfig } from "@/config";

let demoModeCache: boolean | null = null;
export function isDemoMode(): boolean {
  if (demoModeCache !== null) return demoModeCache;
  const flag = envConfig.features.demoMode;
  if (flag === "on") demoModeCache = true;
  else if (flag === "off") demoModeCache = false;
  else demoModeCache = !isInHost();
  return demoModeCache;
}

export function __resetDemoModeCacheForTests(): void {
  demoModeCache = null;
}
