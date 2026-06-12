// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { captureError } from "@/shared/lib/sentry/index.ts";
import { withTimeout } from "@shared/chain/contracts/with-timeout.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

import { getCachedClients, rebuildClients } from "./client.ts";
import { isInHost } from "./connection.ts";
import { pingHostBridge } from "./guarded-signer.ts";

/**
 * Recovery for webview suspends. Backgrounding the app freezes JS and lets
 * the host drop its chain links; the SDK transport caches `isReady()` forever
 * and its `request()` never times out, so a resumed page keeps a PAPI client
 * whose requests hang silently — queries stall and transactions never leave
 * `preparing`. On resume we ping the bridge, probe the cached clients, and
 * rebuild them (fresh provider, fresh chainHead follow) when they are stuck.
 */

export type ResumeRecoveryOutcome = "bridge-dead" | "no-clients" | "healthy" | "rebuilt";

export type ClientProbeResult = "ok" | "stale" | "none";

export interface ResumeRecoveryDeps {
  /** Resolves `true` iff the host bridge answered within `timeoutMs`. */
  readonly ping: (timeoutMs: number) => Promise<boolean>;
  /** Liveness of every cached PAPI client; `none` when no client exists yet. */
  readonly probeClients: (timeoutMs: number) => Promise<ClientProbeResult>;
  readonly rebuild: () => void;
  readonly invalidateQueries: () => Promise<void>;
  readonly notifyBridgeDead: () => void;
  readonly sleep: (ms: number) => Promise<void>;
}

export interface ResumeRecoveryTimings {
  readonly pingTimeoutMs: number;
  readonly pingAttempts: number;
  readonly pingRetryDelayMs: number;
  readonly probeTimeoutMs: number;
}

/** Ping budget ~12s worst case: the bridge can take a beat to thaw after resume. */
export const DEFAULT_TIMINGS: ResumeRecoveryTimings = {
  pingTimeoutMs: 3_000,
  pingAttempts: 3,
  pingRetryDelayMs: 1_500,
  probeTimeoutMs: 4_000,
};

/** Ignore quick app switches; connections survive sub-5s suspends. */
const MIN_HIDDEN_MS = 5_000;

const BRIDGE_DEAD_MESSAGE =
  "Lost connection to the Polkadot host — close and reopen the app, then try again.";

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function probeCachedClients(timeoutMs: number): Promise<ClientProbeResult> {
  const clients = getCachedClients();
  if (clients.length === 0) return "none";
  try {
    await Promise.all(
      clients.map((client) =>
        withTimeout(client.getFinalizedBlock(), timeoutMs, "[host] resume liveness probe"),
      ),
    );
    return "ok";
  } catch {
    return "stale";
  }
}

function notifyBridgeDead(): void {
  useFeedbackStore.getState().showToast(BRIDGE_DEAD_MESSAGE, "err", { durationMs: null });
  captureError(new Error("host bridge unresponsive after resume"), {
    subsystem: "host",
    op: "resume-recovery",
  });
}

const DEFAULT_DEPS: ResumeRecoveryDeps = {
  ping: pingHostBridge,
  probeClients: probeCachedClients,
  rebuild: rebuildClients,
  invalidateQueries: () => queryClient.invalidateQueries(),
  notifyBridgeDead,
  sleep,
};

/**
 * One recovery pass: retry-ping the bridge (dead bridge → sticky toast, the
 * signer cannot work without it), then probe the cached clients and rebuild
 * stuck ones. `invalidateQueries` (v5 default `cancelRefetch: true`) aborts
 * fetches hung on destroyed clients and refetches through fresh ones.
 */
export async function runResumeRecovery(
  deps: ResumeRecoveryDeps,
  timings: ResumeRecoveryTimings = DEFAULT_TIMINGS,
): Promise<ResumeRecoveryOutcome> {
  let alive = await deps.ping(timings.pingTimeoutMs);
  for (let attempt = 1; !alive && attempt < timings.pingAttempts; attempt++) {
    await deps.sleep(timings.pingRetryDelayMs);
    alive = await deps.ping(timings.pingTimeoutMs);
  }
  if (!alive) {
    deps.notifyBridgeDead();
    return "bridge-dead";
  }

  const probe = await deps.probeClients(timings.probeTimeoutMs);
  if (probe === "none") return "no-clients";
  if (probe === "ok") return "healthy";

  deps.rebuild();
  await deps.invalidateQueries();
  return "rebuilt";
}

let installed = false;

/**
 * Install the resume listeners once per page: `visibilitychange` (hidden ≥5s)
 * and `pageshow` with `persisted` (BFCache restore — connections certainly
 * dead). No-op outside a host. Returns an uninstaller for tests/StrictMode.
 */
export function installResumeRecovery(): () => void {
  if (installed || typeof document === "undefined" || !isInHost()) {
    return () => {};
  }
  installed = true;

  let hiddenAt: number | null = null;
  let running = false;

  const recover = (trigger: string): void => {
    if (running) return;
    running = true;
    void runResumeRecovery(DEFAULT_DEPS)
      .then((outcome) => {
        console.info(`[host] resume recovery (${trigger}): ${outcome}`);
      })
      .catch((caught) => {
        captureError(caught, { subsystem: "host", op: "resume-recovery" });
      })
      .finally(() => {
        running = false;
      });
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const hiddenForMs = hiddenAt == null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (hiddenForMs >= MIN_HIDDEN_MS) recover(`hidden ${hiddenForMs}ms`);
  };

  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) recover("bfcache-restore");
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageShow);
    installed = false;
  };
}
