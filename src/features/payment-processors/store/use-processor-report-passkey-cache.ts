// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { createReportPasskeyCache } from "@shared/store/create-report-passkey-cache.ts";

/**
 * Per-group cache of a verified processor-report passkey — what the processor
 * enters at the group's unlock gate. See {@link createReportPasskeyCache}.
 */
export const PROCESSOR_REPORT_PASSKEY_CACHE_KEY = "payment-processor-report-passkey-cache/v1" as const;

const cache = createReportPasskeyCache(
  PROCESSOR_REPORT_PASSKEY_CACHE_KEY,
  "[payment-processors] report-passkey-cache",
);

export const useProcessorReportPasskeyCacheStore = cache.useStore;
export const useProcessorReportPasskeyCache = cache.useCache;
