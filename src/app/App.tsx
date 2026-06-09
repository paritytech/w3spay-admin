// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { RouterProvider } from "@tanstack/react-router";

import { journeyTracker } from "@shared/lib/telemetry.ts";
import { AppProviders } from "./providers.tsx";
import { router } from "./router/index.tsx";
import { TelemetryTestScreen, isTelemetryTestRoute } from "./TelemetryTest.tsx";

// `?telemetry-test=1` short-circuits the whole admin flow and renders the
// team-facing telemetry test surface. It deliberately bypasses the router
// (and thus the host-wallet/session/registry wiring mounted in the root
// layout) — no account poll, no chain reads. Evaluated once at module load.
const telemetryTest = isTelemetryTestRoute();
if (!telemetryTest) {
  // Open the app-boot journey before the first paint. Idempotent inside
  // `journeyTracker.start`, so a StrictMode double-mount won't leak a span.
  // The root layout's `Shell` completes it once the gate + registry settle.
  journeyTracker.start("w3spay-admin:app-boot");
}

export function App() {
  return (
    <AppProviders>
      {telemetryTest ? <TelemetryTestScreen /> : <RouterProvider router={router} />}
    </AppProviders>
  );
}
