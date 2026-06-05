/**
 * App-local telemetry surface for the W3sPay admin console.
 *
 * Instantiates the singleton `journeyTracker` with the journey types
 * the admin flow emits (chain writes, item-config publishes, registry
 * loads, app-boot), plus the common attributes (`app.name`, `app.env`,
 * `host.kind`) that every span carries. Mirrors
 * `apps/w3spay/src/lib/telemetry.ts` — same shape, different
 * `AppJourneyType` enum.
 *
 * Privacy enforcement is in `@/telemetry`'s `scrub.ts` — the
 * `recordJourneyAttribute` guard refuses any key matching
 * `SENSITIVE_KEY_RE` and any string value longer than 32 chars.
 */

import { JourneyTracker } from "@/shared/telemetry";

import { detectHostEnvironment } from "@shared/api/host-connection.ts";

/**
 * Journey kinds emitted by the admin console. Keep this list small;
 * every journey burns one span per session and adding a journey here
 * commits the dashboard to a new categorical filter.
 */
export type AppJourneyType =
  | "app-boot"
  | "chain-write"
  | "publish-item-configs"
  | "merchant-table-load";

/**
 * Sentry `op` for each journey's root span. Keep these stable —
 * changing them invalidates the dashboard's saved searches.
 */
const APP_JOURNEY_OPS: Readonly<Record<AppJourneyType, string>> = {
  "app-boot": "journey.app-boot",
  "chain-write": "journey.chain-write",
  "publish-item-configs": "journey.publish-item-configs",
  "merchant-table-load": "journey.merchant-table-load",
};

/**
 * Map the synchronous host-detection enum onto a short categorical
 * tag for telemetry. `"web-iframe"` is dotli's iframe container,
 * `"desktop-webview"` is Polkadot Desktop's native webview,
 * `"standalone"` is a plain browser tab.
 */
function hostKindTag(): "dotli" | "native" | "browser" {
  switch (detectHostEnvironment()) {
    case "web-iframe":
      return "dotli";
    case "desktop-webview":
      return "native";
    case "standalone":
      return "browser";
  }
}

/**
 * Singleton tracker. App code imports this directly — there is no
 * provider, since the tracker has no React state.
 */
export const journeyTracker = new JourneyTracker<AppJourneyType>({
  ops: APP_JOURNEY_OPS,
  commonAttributes: {
    "app.name": "w3spay-admin",
    "app.env": (import.meta.env.MODE as string | undefined) ?? "development",
    "host.kind": hostKindTag(),
  },
});
