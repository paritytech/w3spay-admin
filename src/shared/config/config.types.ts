import type { NetworkKey } from "@shared/chain/host";

/**
 * Shape of the XCM V5 Location key used to look up the token's balance in
 * `Assets.Account` on the People-system parachain. Kept narrow so the
 * `as const` chain in `config.ts` stays type-checkable.
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
