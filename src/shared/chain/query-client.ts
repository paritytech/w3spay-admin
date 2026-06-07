/**
 * Process-wide TanStack Query client for the W3sPay admin console.
 *
 * A module singleton (not created inside a component) so non-React code
 * — route loaders in `lib/router`, mutation `onSuccess` invalidation,
 * the session-sync `router.invalidate()` path — can reach the same cache
 * the React tree reads through `<QueryClientProvider>`.
 *
 * Defaults:
 *   - `retry: 1`                  — one automatic retry; chain/IPFS reads
 *                                   are flaky enough that a single retry
 *                                   smooths transient failures without
 *                                   hammering a down gateway.
 *   - `refetchOnWindowFocus:false`— the admin console is a long-lived
 *                                   surface inside an iframe/webview;
 *                                   focus churn must not trigger refetch
 *                                   storms. Polling intervals
 *                                   (`refetchInterval`) are opted into
 *                                   per query instead.
 *   - `staleTime: 30_000`         — 30s of freshness so loader-prefetched
 *                                   data is reused by the component's
 *                                   `useSuspenseQuery` without an
 *                                   immediate second fetch.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
