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


import {
  parseNetworkKey,
  type NetworkKey,
} from "@shared/api/host";

const DEFAULT_ADMIN_NETWORK: NetworkKey = "paseo-next-v2";

// ─── Public type ────────────────────────────────────────────────────────

export interface EnvConfig {
  readonly contracts: {
    /**
     * H160 address of the deployed `W3SPayMerchantRegistry` contract. Empty
     * string until `VITE_W3SPAY_REGISTRY_ADDRESS` is set in the environment;
     * read sites MUST handle the empty case (the AdminAccess gate surfaces
     * it as `registry-config-error`).
     */
    readonly merchantRegistryAddress: string;
    /**
     * H160 address of the deployed `T3rminalBulletinIndex` contract — the
     * registry that maps `(shopKey, date) -> CID` for daily reports. Read-
     * only from this app; the writer is T3rminal-v1 itself.
     *
     * Defaults to the Paseo Asset Hub Next v2 deployment baked into
     * `apps/t3rminal-v1/lib/contracts/config.ts`. Override via
     * `VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS` when running against a fork
     * or a future redeploy. An empty string disables the Reports surface
     * — `useT3rminalReportIndex` short-circuits and the UI shows a
     * config-missing notice rather than spamming the chain with empty
     * shopKey reads.
     */
    readonly t3rminalBulletinIndexAddress: string;
  };
  readonly host: {
    /**
     * Manifest-registered dotNS identifier. The host validates product
     * account requests against this exact string — bundle hash:
     * `bundle/manifest.toml::[app].id`.
     */
    readonly productDotNs: string;
    /**
     * BIP44-style derivation index for the admin's product account. We only
     * ever derive `0`; reserved here so a future migration can rotate.
     */
    readonly productDerivationIndex: number;
  };
  readonly chain: {
    /** Active network key. Drives `host/client.ts` chain selection. */
    readonly network: NetworkKey;
    /**
     * Stable read-origin AccountId for pallet-revive dry-run contract reads.
     * EVM-derived sentinel: H160 = `0x0000…0000`, AccountId32 trailer = 12×
     * `0xEE`. pallet-revive recognises any AccountId32 ending in twelve
     * `0xEE` bytes as already-mapped, so dry-runs from this origin skip the
     * mapping tx.
     */
    readonly readOnlyOrigin: string;
  };
  readonly token: {
    /** UI ticker, e.g. `"CASH"`. Surfaces on Balances + merchant detail. */
    readonly symbol: string;
    /** Smallest-unit decimals — the host API speaks in `10^decimals`. */
    readonly decimals: number;
    /** `pallet-assets` asset id used as the `GeneralIndex` junction. */
    readonly assetId: bigint;
    /** Reserve parachain id used as the `Parachain` junction. */
    readonly parachainId: number;
    /** `PalletInstance` junction. 50 = `pallet-assets` on the reserve chain. */
    readonly palletInstance: number;
    /** XCM V5 Location, derived from the three junctions above. */
    readonly location: TokenLocation;
  };
  readonly features: {
    /**
     * Demo-mode trigger. Resolved against the live host environment by
     * `isDemoMode()` in `lib/demo/demo-mode.ts`. Driven by `VITE_DEMO_MODE`:
     *
     *   - `"auto"` (default) — demo mode is on outside a Polkadot host.
     *     Inside a host the real chain-bound flow runs.
     *   - `"on"`              — demo mode forced on, even inside a host.
     *     Useful for screencasts and design review with the host available.
     *   - `"off"`             — demo mode disabled. Outside-host falls
     *     back to the standard `<Gate>` "host required" screen.
     */
    readonly demoMode: "auto" | "on" | "off";
  };

  /**
   * Sentry-backed productivity telemetry — chain-write timing plus
   * error capture. Lives in `EnvConfig` so the master switch is a
   * code edit (`enabled: false` below), not an env hunt; call sites
   * never branch on this because the tracker degrades to console-only
   * mode when Sentry is uninitialised.
   *
   * See `apps/w3spay-admin/src/instrument.ts` for the bootstrap order:
   *   1. read `envConfig.telemetry`
   *   2. if `!enabled` → leave `Sentry.init` uncalled. Tracker still
   *      logs `[Journey:*]` to console.
   *   3. otherwise → `initTelemetry({ dsn, environment, ... })`. If
   *      `dsn === ""`, Sentry initialises with `enabled: false`
   *      internally — same console-only behaviour but the API surface
   *      is live for a runtime DSN injection.
   */
  readonly telemetry: {
    /**
     * Master switch. `false` short-circuits `initTelemetry()` before
     * any `@sentry/react` code runs. Default `true`. Flip to `false`
     * here to kill telemetry for a build.
     */
    readonly enabled: boolean;
    /**
     * Sentry DSN. Empty string = console-only mode. Sourced from
     * `VITE_W3SPAY_ADMIN_SENTRY_DSN`.
     */
    readonly dsn: string;
    /**
     * Sentry environment label. Defaults to `import.meta.env.MODE`.
     */
    readonly environment: string;
    /**
     * Traces sample rate (0..1). Default 1.0. Override via
     * `VITE_W3SPAY_ADMIN_SENTRY_TRACES_SAMPLE_RATE`.
     */
    readonly tracesSampleRate: number;
  };

  /**
   * In-page debug overlay. The host's mobile webview ships only the
   * built SPA — there's no DevTools to peek at when the iOS boot
   * splash sticks. The `<DebugPanel />` toolbox button rides along
   * in production builds and is gated by this flag.
   *
   * - `enabled: true`              → mount the toolbox button + panel.
   *                                  Default `true` for staging and
   *                                  pilot deploys; production
   *                                  public deploys should set
   *                                  `false` via `VITE_W3SPAY_ADMIN_DEBUG_PANEL=false`.
   * - `openByDefault: boolean`     → whether the panel is open on
   *                                  first mount. Default `false` so
   *                                  the toolbox button is the entry
   *                                  point.
   * - `defaultTab: "console" | "timeline" | "host" | "actions"`
   *                                → which tab to show on first
   *                                  open. Default `"timeline"` for
   *                                  admin so a host-regression
   *                                  screams from the timeline.
   *
   * The panel is React-only. The capture (`console.*`, `window.onerror`,
   * `unhandledrejection`) installs as a side-effect of the panel mount
   * — when the panel is disabled, nothing is captured and the
   * ring-buffer stays empty.
   */
  readonly debug: {
    readonly enabled: boolean;
    readonly openByDefault: boolean;
    readonly defaultTab: "console" | "timeline" | "host" | "actions";
  };
}

/**
 * Shape of the XCM V5 Location key used to look up the token's balance in
 * `Assets.Account` on the People-system parachain. Kept narrow so the
 * `as const` chain at the bottom of this file stays type-checkable.
 */
export interface TokenLocation {
  readonly parents: 1;
  readonly interior: {
    readonly type: "X3";
    readonly value: readonly [
      { readonly type: "Parachain"; readonly value: number },
      { readonly type: "PalletInstance"; readonly value: number },
      { readonly type: "GeneralIndex"; readonly value: bigint },
    ];
  };
}

// ─── Env reader ─────────────────────────────────────────────────────────

function envString(key: string, fallback: string): string {
  const value = import.meta.env[key] as string | undefined;
  return value ?? fallback;
}

function envBigInt(key: string, fallback: string): bigint {
  return BigInt((import.meta.env[key] as string | undefined) ?? fallback);
}

function envNumber(key: string, fallback: string): number {
  return Number((import.meta.env[key] as string | undefined) ?? fallback);
}

function envFlag(key: string, fallback: boolean): boolean {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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

