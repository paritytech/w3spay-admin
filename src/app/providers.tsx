/**
 * The unavoidable React provider shell — the library boundaries that
 * cannot be expressed as Zustand stores or TanStack Query hooks:
 *
 *   - `Sentry.ErrorBoundary` — renders `<ErrorFallback/>` on a thrown
 *     render; the primary in-tree chokepoint for React errors.
 *   - `QueryClientProvider` — the process-wide TanStack Query cache.
 *
 * The `RouterProvider` is composed by `App` (not here) so the
 * telemetry-test surface can bypass the router while staying inside this
 * shell — matching the prior bootstrap exactly. There are no product
 * state providers; session/registry/feedback state live in stores +
 * query hooks.
 */

import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { ErrorFallback } from "@shared/components/ErrorFallback.tsx";
import { queryClient } from "@shared/chain/query-client.ts";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Sentry.ErrorBoundary>
  );
}
