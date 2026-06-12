// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { QueryClient } from "@tanstack/react-query";

/**
 * Shared poll cadence for on-chain resource registries (merchants,
 * restaurants, item configs, processor configs) so every admin device
 * converges on writes another device published.
 */
export const REGISTRY_POLL_MS = 10_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
