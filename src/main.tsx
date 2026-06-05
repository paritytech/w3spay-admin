// `./instrument` MUST be the first import. It wires Sentry's global
// error handlers before any other product module evaluates so an
// import-time throw still surfaces in the dashboard.
import "./instrument.ts";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";

import { App } from "@app/App.tsx";
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
