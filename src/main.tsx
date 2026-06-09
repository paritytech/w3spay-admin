// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

// `./instrument` MUST be the first import. It wires Sentry's global
// error handlers before any other product module evaluates so an
// import-time throw still surfaces in the dashboard.
import "./instrument.ts";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";

import { App } from "@app/App.tsx";
// Self-hosted fonts (bundled into dist) — no runtime fetch to Google Fonts.
import "@fontsource/dm-sans/latin-300.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/dm-serif-display/latin-400-italic.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("missing #root container");

createRoot(container, {
  // React 19 routes errors that escape an `<ErrorBoundary>` (or aren't
  // bound by one) through these three hooks. The `<Sentry.ErrorBoundary>`
  // in `AppProviders` is the primary chokepoint (it renders
  // <ErrorFallback/>); these handlers are the backstop for anything it
  // can't catch (errors during the boundary's own render or outside the
  // React tree).
  onCaughtError: Sentry.reactErrorHandler(),
  onUncaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
