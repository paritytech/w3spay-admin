/**
 * Environment-derived runtime configuration for the W3sPay admin console.
 *
 * Everything the app needs from `import.meta.env`, plus a small set of
 * compile-time constants that conceptually belong with them, is resolved
 * once into a nested `EnvConfig` at module load and exposed two ways:
 *
 *   - `envConfig` — the module-level singleton. The canonical access
 *     path for everything (non-React modules, stores, query factories,
 *     loaders, encoders, signer plumbing).
 *
 *   - `useConfig()` — a thin React-side accessor that returns the same
 *     singleton. Env is immutable at runtime, so there is no provider
 *     and no context — it is config, not state.
 *
 * NEVER reach into `import.meta.env` outside this module — env access is
 * centralized here so a single audit covers what the deploy can override.
 */

import { parseNetworkKey, type NetworkKey } from "@shared/chain/host";
import { envString, envBigInt, envNumber, envFlag } from "@shared/utils/env";
import type { EnvConfig } from "./config.types";

export type { EnvConfig, TokenLocation } from "./config.types";

const DEFAULT_ADMIN_NETWORK: NetworkKey = "paseo-next-v2";


// ─── Env reader ─────────────────────────────────────────────────────────

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
      merchantRegistryAddress: envString("VITE_W3SPAY_REGISTRY_ADDRESS", "0xfec1497a5fbfc2583ea52bc7504701f95ea4a68a"),
      // Default lifted from `apps/t3rminal-v1/lib/contracts/config.ts:21` —
      // the same address t3rminal-v1 writes to on Paseo Asset Hub Next v2.
      t3rminalBulletinIndexAddress: envString(
        "VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS",
        "0x3331A87C2B9312E246E6A7eE8D0C0AdD8d282B6F",
      ),
    },
    host: {
      productDotNs: "w3spayadmin.dot",
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
      demoMode: "off",
    },
    telemetry: {
      // ← KILL SWITCH. Flip to `false` to ship a build with telemetry
      // disabled entirely. The tracker degrades to console-only mode;
      // no Sentry network calls, no global handlers.
      enabled: true,
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
      // Master switch for the in-page toolbox button + draggable
      // overlay (see `@/sdk/host/debug` → `DebugPanel`). Default
      // `true` for staging + pilot deploys; set
      // `VITE_W3SPAY_ADMIN_DEBUG_PANEL=false` for public production
      // deploys to strip the button.
      enabled: envFlag("VITE_W3SPAY_ADMIN_DEBUG_PANEL", true),
      // Default `true` while we're hunting the iOS host boot-regression
      // — a session-startup log is the only signal we have when the
      // host wedges, and the panel is the cheapest place to see it.
      // Set `VITE_W3SPAY_ADMIN_DEBUG_PANEL_OPEN=false` to revert.
      openByDefault: envFlag("VITE_W3SPAY_ADMIN_DEBUG_PANEL_OPEN", true),
      // Admin defaults to the timeline tab — a host-regression
      // question is "did the auth flow's phase transitions
      // complete?", and the timeline is the most direct view of
      // that. The console tab is still one click away.
      defaultTab: "timeline",
    },
  };
}

// ─── Singleton + React surface ──────────────────────────────────────────

/** Resolved-once env config. The canonical access path everywhere. */
export const envConfig: EnvConfig = readEnv();

/**
 * React-side accessor. Returns the `envConfig` singleton — env is
 * immutable at runtime, so there is no context to subscribe to. Kept as
 * a named accessor so component call sites read uniformly.
 */
export function useConfig(): EnvConfig {
  return envConfig;
}

