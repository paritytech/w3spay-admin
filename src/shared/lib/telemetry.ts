// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { JourneyTracker } from "@/shared/lib/sentry";

import { detectHostEnvironment } from "@shared/chain/host-connection.ts";

/** Journey kinds emitted by the admin console. Keep the list small — each journey burns one span per session and adds a dashboard filter. */
export type AppJourneyType =
  | "app-boot"
  | "chain-write"
  | "publish-item-configs"
  | "publish-processor-config"
  | "merchant-table-load";

/** Sentry `op` for each journey's root span. Keep stable — changing them invalidates the dashboard's saved searches. */
const APP_JOURNEY_OPS: Readonly<Record<AppJourneyType, string>> = {
  "app-boot": "journey.app-boot",
  "chain-write": "journey.chain-write",
  "publish-item-configs": "journey.publish-item-configs",
  "publish-processor-config": "journey.publish-processor-config",
  "merchant-table-load": "journey.merchant-table-load",
};

/** Map the host-detection enum onto a short categorical tag for telemetry. */
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

export const journeyTracker = new JourneyTracker<AppJourneyType>({
  ops: APP_JOURNEY_OPS,
  commonAttributes: {
    "app.name": "w3spay-admin",
    "app.env": (import.meta.env.MODE as string | undefined) ?? "development",
    "host.kind": hostKindTag(),
  },
});
