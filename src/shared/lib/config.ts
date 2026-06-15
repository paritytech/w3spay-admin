// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { NetworkKey } from "@shared/chain/host";

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
     * H160 address of the deployed `W3SPayRegistry`. Empty until
     * `VITE_W3SPAY_REGISTRY_ADDRESS` is set; read sites MUST handle the empty case.
     */
    readonly merchantRegistryAddress: string;
    /**
     * H160 address of the deployed `T3rminalBulletinIndex` contract (daily
     * `(merchantId, terminalId, date) -> CID` reports). An empty string disables
     * the Reports surface; override via `VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS`.
     */
    readonly t3rminalBulletinIndexAddress: string;
  };
  readonly host: {
    /**
     * Manifest-registered dotNS identifier. The host validates product account
     * requests against this exact string (`bundle/manifest.toml::[app].id`).
     */
    readonly productDotNs: string;
    /** BIP44-style derivation index for the product account; only `0` is used. */
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
     * Demo-mode trigger, driven by `VITE_DEMO_MODE`: `"auto"` (on outside a
     * Polkadot host), `"on"` (forced on), `"off"` (disabled).
     */
    readonly demoMode: "auto" | "on" | "off";
  };

  /**
   * Sentry-backed telemetry. The master switch is a code edit (`enabled: false`),
   * not an env hunt; call sites never branch on it because the tracker degrades
   * to console-only mode when Sentry is uninitialised.
   */
  readonly telemetry: {
    /** Master switch; `false` short-circuits `initTelemetry()`. Default `true`. */
    readonly enabled: boolean;
    /** Sentry DSN. Empty string = console-only mode. */
    readonly dsn: string;
    /** Sentry environment label. Defaults to `import.meta.env.MODE`. */
    readonly environment: string;
    /** Traces sample rate (0..1). Default `1.0`. */
    readonly tracesSampleRate: number;
  };

  /**
   * In-page debug overlay. The host's mobile webview ships only the built SPA
   * with no DevTools, so the `<DebugPanel />` toolbox button rides along in
   * production builds, gated by these flags.
   */
  readonly debug: {
    readonly enabled: boolean;
    readonly openByDefault: boolean;
    readonly defaultTab: "console" | "timeline" | "host" | "actions";
  };
}
