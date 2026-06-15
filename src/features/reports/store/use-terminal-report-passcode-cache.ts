// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { createReportPasskeyCache } from "@shared/store/create-report-passkey-cache.ts";

/**
 * Per-terminal cache of a verified report passcode — the phrase typed at the
 * T3rminal reports unlock gate (keyed by the terminal's merchant key). Only
 * written for terminals with no QR assignment, since a QR-issued password is
 * already the source of truth. See {@link createReportPasskeyCache}.
 */
export const TERMINAL_REPORT_PASSCODE_CACHE_KEY = "t3rminal-report-passcode-cache/v1" as const;

const cache = createReportPasskeyCache(
  TERMINAL_REPORT_PASSCODE_CACHE_KEY,
  "[reports] terminal-passcode-cache",
);

export const useTerminalReportPasscodeCacheStore = cache.useStore;
export const useTerminalReportPasscodeCache = cache.useCache;
