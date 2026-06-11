// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { parseNetworkKey, type NetworkKey } from "@shared/chain/host";
import { envString, envBigInt, envNumber, envFlag, requireEnvString } from "@shared/utils/env";
import type { EnvConfig } from "@shared/lib/config";

export type { EnvConfig, TokenLocation } from "@shared/lib/config";

const DEFAULT_ADMIN_NETWORK: NetworkKey = "paseo-next-v2";

function readDemoMode(): EnvConfig["features"]["demoMode"] {
  const value = envString("VITE_DEMO_MODE", "auto").trim().toLowerCase();
  return value === "on" || value === "off" || value === "auto" ? value : "auto";
}

function readEnv(): EnvConfig {
  const network: NetworkKey =
    parseNetworkKey(import.meta.env.VITE_NETWORK as string | undefined) ?? DEFAULT_ADMIN_NETWORK;

  const symbol = envString("VITE_TOKEN_SYMBOL", "CASH");
  const decimals = 6;
  const assetId = envBigInt("VITE_TOKEN_ASSET_ID", "50000413");
  const parachainId = envNumber("VITE_TOKEN_PARACHAIN_ID", "1500");
  const palletInstance = envNumber("VITE_TOKEN_PALLET_INSTANCE", "50");

  return {
    contracts: {
      merchantRegistryAddress: envString("VITE_W3SPAY_REGISTRY_ADDRESS", "0x34a4eb4a676ab25ec78241d396267484064541a5"),
      // Default is the Bulletin index contract address on Paseo Asset Hub
      // Next v2 (the chain the report producer writes to).
      t3rminalBulletinIndexAddress: envString(
        "VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS",
        "0x3467596e99D24E62Ae5525DEAd280de2cAA735e4",
      ),
    },
    host: {
      productDotNs: requireEnvString("VITE_DOTNS_PRODUCT_DOMAIN"),
      productDerivationIndex: 0,
    },
    chain: {
      network,
      readOnlyOrigin: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    },
    token: {
      symbol,
      decimals,
      assetId,
      parachainId,
      palletInstance,
      location: {
        parents: 1,
        interior: {
          type: "X3",
          value: [
            { type: "Parachain", value: parachainId },
            { type: "PalletInstance", value: palletInstance },
            { type: "GeneralIndex", value: assetId },
          ],
        },
      } as const,
    },
    features: {
      demoMode: readDemoMode(),
    },
    telemetry: {
      enabled: false,
      dsn: envString("VITE_W3SPAY_ADMIN_SENTRY_DSN", ""),
      environment: envString(
        "VITE_W3SPAY_ADMIN_SENTRY_ENV",
        (import.meta.env.MODE as string | undefined) ?? "development",
      ),
      tracesSampleRate: Number(
        envString("VITE_W3SPAY_ADMIN_SENTRY_TRACES_SAMPLE_RATE", "1.0"),
      ),
    },
    debug: {
      enabled: envFlag("VITE_W3SPAY_ADMIN_DEBUG_PANEL", false),
      openByDefault: envFlag("VITE_W3SPAY_ADMIN_DEBUG_PANEL_OPEN", false),
      defaultTab: "timeline",
    },
  };
}

export const envConfig: EnvConfig = readEnv();

export function useConfig(): EnvConfig {
  return envConfig;
}
