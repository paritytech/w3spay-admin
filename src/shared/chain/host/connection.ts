// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  createAccountsProvider,
  injectSpektrExtension as sdkInjectSpektrExtension,
  hostApi,
  requestDevicePermission,
  requestPermission,
  sandboxProvider,
  sandboxTransport,
} from "@novasamatech/host-api-wrapper";
import { enumValue } from "@novasamatech/host-api";

declare global {
  interface Window {
    /** Set by Polkadot Desktop's webview shell. */
    __HOST_WEBVIEW_MARK__?: boolean;
  }
}

export type HostEnvironment = "desktop-webview" | "web-iframe" | "standalone";

export function detectHostEnvironment(): HostEnvironment {
  if (typeof window === "undefined") return "standalone";
  if (window.__HOST_WEBVIEW_MARK__ === true) return "desktop-webview";
  try {
    if (window !== window.top) return "web-iframe";
  } catch {
    // Cross-origin iframe — `window.top` access throws, treat as hosted.
    return "web-iframe";
  }
  return "standalone";
}

export function isInHost(): boolean {
  return detectHostEnvironment() !== "standalone";
}

export function isSandboxReady(): boolean {
  return sandboxProvider.isCorrectEnvironment();
}

type AccountsProvider = ReturnType<typeof createAccountsProvider>;

let accountsProvider: AccountsProvider | null = null;

export function getAccountsProvider(): AccountsProvider {
  if (accountsProvider === null) {
    accountsProvider = createAccountsProvider(sandboxTransport);
  }
  return accountsProvider;
}

/**
 * True during `vite dev` only for standalone local runs where no host bridge
 * exists. Hosted dev sessions should exercise the real host path: dotli/TUA
 * through `window.truapi`, or native Polkadot containers through the
 * standard product-sdk Host API.
 *
 * `import.meta.env.DEV` is `false` in production builds, so callers gated by
 * this branch are tree-shaken out of prod bundles regardless of the runtime
 * check.
 */
export function isDevStandalone(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return !isInHost() && (window as Window & { truapi?: unknown }).truapi == null;
}

/** iPadOS 13+ reports a Mac UA but is distinguishable via touch points. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod|iPad/.test(ua)) return true
  if (/Mac/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

/**
 * Used for iOS-host-only workarounds: the host injects a viewport meta
 * without `viewport-fit=cover`, collapsing `env(safe-area-inset-*)` to 0.
 */
export function isHostIOS(): boolean {
  return isInHost() && isIOS()
}

/**
 * Wall-clock budget for the host-API transport handshake.
 *
 * 15s matches w3s-conference-app's `CONNECT_TIMEOUT_MS` (it bounds the
 * `getProductAccount` round-trip; we bound the underlying `isReady` wait
 * here so the same upper bound applies regardless of which request
 * happens to be first). On Polkadot mobile the webview port can take
 * several seconds to publish on a cold start — anything shorter risks
 * false negatives on first launch after the app has been backgrounded.
 */
export const HOST_HANDSHAKE_TIMEOUT_MS = 15_000;

/**
 * Race a promise against a wall-clock timeout. The timer is always
 * cleared on resolution/rejection so it can't fire after a late winner
 * already settled the race.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Async handshake cache. The `connected` flag sticks for the lifetime of
 * the page once it has flipped to `true` — repeated `connectToHost()`
 * calls in that state short-circuit to `true` without re-poking the SDK.
 * A `false` outcome is NOT cached: the SDK caches its own wire-level
 * failure, so re-attempts resolve quickly to `false` again, but the
 * caller gets a fresh shot — handy for a "retry" CTA without forcing
 * a page reload.
 */
let connected = false;
let inFlightHandshake: Promise<boolean> | null = null;

/**
 * Await the host-API transport handshake and prime the AccountsProvider
 * singleton. MUST be awaited before any direct host request
 * (`subscribeAccountConnectionStatus`, `getProductAccount`, `requestLogin`,
 * …) — without it, those requests race the handshake and on slow
 * webview-port bring-up (Polkadot mobile) the SDK surfaces
 * `RequestCredentialsErr::Unknown` with reason `"Polkadot host is not
 * ready"`. Mirrors `injectSpektrExtension()` in
 * w3s-conference-app's wallet store, which is the only step that
 * distinguishes its working mobile flow from a stuck boot splash.
 *
 * Returns:
 *   - `true`  once the handshake succeeds within the timeout. Cached
 *             for the rest of the page lifetime.
 *   - `false` outside a host, when the sandbox transport is not in
 *             scope, when the handshake itself fails, OR when the
 *             timeout fires before the host responds. NOT cached —
 *             a subsequent call re-attempts. (The SDK caches its own
 *             wire-level failure, so the second attempt is usually
 *             near-instant.)
 *
 * Concurrent calls share a single in-flight promise; the timeout is
 * bounded by `HOST_HANDSHAKE_TIMEOUT_MS` (15s by default, override
 * per-call for tests).
 *
 * The wallet store's `initInternal` runs `injectHostWallet()` first so
 * the same `sandboxTransport.isReady()` wait is already done by the
 * time this is called in production — the second `isReady()` is a
 * cached no-op at the SDK level, and a real call only happens when
 * `connectToHost` is reached from a non-store caller (tests, direct
 * use).
 */
export async function connectToHost(
  timeoutMs: number = HOST_HANDSHAKE_TIMEOUT_MS,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isInHost()) return false;
  if (connected) return true;
  if (inFlightHandshake) return inFlightHandshake;

  if (!isSandboxReady()) {
    // Don't short-circuit — on Polkadot mobile the port can take a beat
    // to publish. Fall through to the awaited handshake below, which
    // has its own timeout. Without this branch, the very first React
    // effect on iOS would race the port and we are back to the
    // RequestCredentialsErr::Unknown bug.
    console.log("[host] sandbox transport not yet in scope; awaiting handshake");
  }

  // Prime the AccountsProvider singleton so subsequent `getAccountsProvider()`
  // callers reuse it. Constructing the wrapper does not itself open the
  // connection — `sandboxTransport.isReady()` is what actually completes the
  // handshake.
  // eslint-disable-next-line no-console
  console.info(
    "[host] connectToHost: priming AccountsProvider, awaiting sandboxTransport.isReady()",
  );
  getAccountsProvider();

  inFlightHandshake = withTimeout(
    sandboxTransport.isReady().then((ready) => {
      connected = ready;
      if (ready) {
        // eslint-disable-next-line no-console
        console.info("[host] handshake ok");
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[host] handshake did not complete within the SDK budget; transport returned false",
        );
      }
      return ready;
    }),
    timeoutMs,
    "[host] handshake",
  )
    .catch((caught) => {
      const message = caught instanceof Error ? caught.message : String(caught);
      console.warn(`[host] handshake failed: ${message}`);
      connected = false;
      return false;
    })
    .finally(() => {
      inFlightHandshake = null;
    });

  return inFlightHandshake;
}

export function isHostConnected(): boolean {
  return connected;
}

/**
 * Wall-clock ceiling a single host modal may hold the serialization
 * lock. The host shows one modal at a time and silently drops any
 * request that arrives while another is open; this ceiling guarantees a
 * never-answered modal (user backgrounds the app, host wedges) eventually
 * releases the lock so the modals queued behind it still run.
 */
export const HOST_MODAL_MAX_LOCK_MS = 120_000;

/**
 * FIFO tail of the host-modal queue. Always the settled state of the
 * last-enqueued task (or its ceiling, whichever comes first). A new task
 * chains off this tail, so it only opens its modal after the previous one
 * has closed.
 */
let hostModalQueue: Promise<unknown> = Promise.resolve();

/**
 * Serialize a host-modal request behind every prior one.
 *
 * The host renders modals one at a time and **silently drops** a request
 * that arrives while another modal is open — so two permission prompts
 * fired during boot (Sentry remote-origins + `ChainSubmit`) race, and the
 * loser never appears, leaving the gate stuck on a grant the user was
 * never asked for. This makes the "one at a time" invariant explicit: the
 * `task` only runs once the previously-enqueued modal settles.
 *
 * Both settle paths advance the chain (`then(task, task)`), so a denied or
 * failed modal does not wedge everything queued behind it. The returned
 * promise is the task's own result (not the lock), so callers observe the
 * real grant/deny outcome and errors propagate normally.
 */
export function runExclusiveHostModal<T>(task: () => PromiseLike<T>): Promise<T> {
  const run = Promise.resolve(hostModalQueue).then(task, task);
  const { promise: ceiling, resolve: openCeiling } = Promise.withResolvers<void>();
  const timer = setTimeout(openCeiling, HOST_MODAL_MAX_LOCK_MS);
  hostModalQueue = Promise.race([
    run.then(
      () => undefined,
      () => undefined,
    ),
    ceiling,
  ]).finally(() => clearTimeout(timer));
  return run;
}

/**
 * Test-only reset of the host-modal FIFO tail. Production code MUST NOT
 * call this — the queue's continuity across a session is what keeps the
 * one-modal-at-a-time invariant intact.
 */
export function __resetHostModalQueueForTests(): void {
  hostModalQueue = Promise.resolve();
}

/**
 * Ask the host to grant the camera permission, returning the user's
 * grant/deny decision.
 *
 * **Outside a host:** returns `true` unconditionally. The browser's
 * native `getUserMedia` prompt is the right surface to fall through to
 * — the host's permission modal is meaningless in a regular tab, and
 * a `false` here would deadlock the scanner into its denied state.
 *
 * **Inside a host (dot.li / Polkadot Desktop / mobile):** delegates to
 * `requestDevicePermission("Camera")` from
 * `@novasamatech/host-api-wrapper`. The dot.li iframe only sets
 * `allow="camera"` after the host's modal grants the permission —
 * without this gate, the very first `getUserMedia` call inside the
 * iframe is rejected with a `NotAllowedError` regardless of the user's
 * actual preference.
 *
 * The SDK returns a `ResultAsync<boolean, GenericError>`. We unwrap
 * with `.match()` per the SDK convention:
 *   - `ok(true)`  — granted
 *   - `ok(false)` — denied by the user
 *   - `err(...)`  — transport/encoding error → thrown so the caller's
 *     `try/catch` can decide whether to fall through to getUserMedia
 *     or surface a hard failure.
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (!isInHost()) return true;
  const result = await runExclusiveHostModal(() => requestDevicePermission("Camera"));
  return result.match(
    (granted) => granted,
    (err) => {
      const reason =
        "reason" in err && typeof err.reason === "string" ? err.reason : "unknown";
      throw new Error(`[host] requestCameraPermission failed: ${reason}`);
    },
  );
}

/**
 * Outcome of a `requestRemoteOriginPermission` round-trip.
 *
 *   - `granted: true`  — the host allowlisted the origin(s) (or had
 *     already), OR we are outside a host (no sandbox gate — the browser
 *     issues the request directly).
 *   - `granted: false, error: undefined` — user denied at the host prompt.
 *   - `granted: false, error: string`    — transport / handshake failure.
 */
export interface RemoteOriginPermissionOutcome {
  readonly granted: boolean;
  readonly error?: string;
}

/**
 * Per-page-lifetime cache keyed by the sorted origin list. The host
 * persists the decision permanently, but caching avoids re-issuing the
 * transport call when several subsystems ask for the same origins during
 * one session. Only definitive grants are cached — a transient failure
 * (handshake not ready yet) stays retryable.
 */
const remoteOriginOutcomes = new Map<string, RemoteOriginPermissionOutcome>();
const inFlightRemoteOrigins = new Map<string, Promise<RemoteOriginPermissionOutcome>>();

/**
 * Ask the host to allowlist outbound HTTP/WS to one or more origins so
 * `fetch` / `WebSocket` from the sandboxed product iframe can reach them.
 *
 * Outside a host: no sandbox gate exists, so this resolves to
 * `{ granted: true }` without poking the SDK.
 *
 * Never throws: a denied or failed grant must not break the host app, so
 * failures come back as `{ granted: false, error }`.
 *
 * `origins` are bare host patterns per the host-API `Remote` codec — e.g.
 * `"o123.ingest.us.sentry.io"` or `"*.example.com"`. No scheme, no path.
 */
export function requestRemoteOriginPermission(
  origins: readonly string[],
): Promise<RemoteOriginPermissionOutcome> {
  if (!isInHost() || origins.length === 0) {
    return Promise.resolve({ granted: true });
  }
  const key = [...origins].sort().join(",");
  const cached = remoteOriginOutcomes.get(key);
  if (cached) return Promise.resolve(cached);
  const inFlight = inFlightRemoteOrigins.get(key);
  if (inFlight) return inFlight;
  const pending = doRequestRemoteOrigins([...origins])
    .then((outcome) => {
      if (outcome.granted) remoteOriginOutcomes.set(key, outcome);
      return outcome;
    })
    .finally(() => {
      inFlightRemoteOrigins.delete(key);
    });
  inFlightRemoteOrigins.set(key, pending);
  return pending;
}

async function doRequestRemoteOrigins(
  origins: string[],
): Promise<RemoteOriginPermissionOutcome> {
  try {
    const ready = await connectToHost();
    if (!ready) return { granted: false, error: "host transport not ready" };
    return await runExclusiveHostModal(() =>
      requestPermission({ tag: "Remote", value: origins }).match<RemoteOriginPermissionOutcome>(
        (granted) => ({ granted }),
        (err) => ({ granted: false, error: err.payload?.reason ?? err.message }),
      ),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { granted: false, error: message };
  }
}

/**
 * Test-only reset for `connectToHost()`'s cache. Production code MUST
 * NOT call this — the connection's stability across a session is part
 * of the boot order that keeps the rest of the app's effects in a
 * consistent state.
 */
export function __resetHostConnectionForTests(): void {
  connected = false;
  inFlightHandshake = null;
  accountsProvider = null;
  injectedExtension = null;
  inFlightInject = null;
  remoteOriginOutcomes.clear();
  inFlightRemoteOrigins.clear();
}


export interface ResourceAllowanceOutcome {
  granted: boolean;
  error?: string;
}

/**
 * Wait for the host's wallet to be bridged as a browser extension into
 * the page's `injectedWeb3` context. This is the iOS-specific step that
 * the conference-app's working mobile flow performs BEFORE any direct
 * host-API request. The SDK's `injectSpektrExtension` internally polls
 * the webview port for bring-up; without it, `sandboxTransport.isReady()`
 * races the port on Polkadot mobile and resolves to `false` even though
 * the host is up.
 *
 * Cached for the page lifetime. A `false` outcome is NOT cached — the
 * SDK's failure is sticky at the wire level, but a re-attempt costs
 * little and a `retry` CTA should be able to recover.
 */
let injectedExtension: boolean | null = null;
let inFlightInject: Promise<boolean> | null = null;

export function injectHostWallet(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!isInHost()) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: no host detected; skipping");
    return Promise.resolve(false);
  }
  if (injectedExtension === true) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: cached=true (already injected)");
    return Promise.resolve(true);
  }
  if (inFlightInject !== null) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: in-flight; sharing existing promise");
    return inFlightInject;
  }
  // eslint-disable-next-line no-console
  console.info(
    "[host] injectHostWallet: starting injectSpektrExtension (iOS webview-port bring-up)",
  );
  const startedAt = Date.now();
  inFlightInject = sdkInjectSpektrExtension()
    .then((ok) => {
      const elapsed = Date.now() - startedAt;
      if (ok) {
        injectedExtension = true;
        // eslint-disable-next-line no-console
        console.info(`[host] injectSpektrExtension ok (${elapsed}ms)`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[host] injectSpektrExtension returned false (${elapsed}ms); host wallet unavailable`,
        );
      }
      return ok;
    })
    .catch((caught) => {
      const elapsed = Date.now() - startedAt;
      const reason = caught instanceof Error ? caught.message : String(caught);
      console.warn(
        `[host] injectSpektrExtension threw after ${elapsed}ms: ${reason}`,
      );
      return false;
    })
    .finally(() => {
      inFlightInject = null;
    });
  return inFlightInject;
}

export function isHostWalletInjected(): boolean {
  return injectedExtension === true;
}

/** Wall-clock budget for a single claim. The allocation modal is user-interactive. */
export const ALLOC_TIMEOUT_MS = 120_000;

/**
 * Interpret the host's `requestResourceAllocation` success payload. The
 * host returns a `Vector<AllocationOutcome>` — one entry per requested
 * resource — so the value is an ARRAY, not a single tagged enum. We claim
 * one kind per call, so only the first entry is meaningful.
 *
 * `Rejected` / `NotAvailable` are the host's explicit denials. `Allocated`
 * — or any unrecognized/legacy shape — is treated as granted (permissive,
 * matching the prior fallback so a protocol bump can't silently wedge
 * signing).
 */
export function interpretAllocationOutcome(value: unknown): {
  granted: boolean;
  error?: string;
} {
  const outcomes = Array.isArray(value) ? value : [value];
  const first = outcomes[0];
  const tag =
    first !== null && typeof first === "object" && "tag" in first
      ? String((first as { tag: unknown }).tag)
      : undefined;
  if (tag === "Rejected" || tag === "NotAvailable") {
    return { granted: false, error: tag };
  }
  return { granted: true };
}


/**
 * Claim a set of resource allowances from the host. Each claim surfaces
 * the host's modal on first run; subsequent claims are instant. Cached
 * per page lifetime — `__resetHostConnectionForTests` clears the cache.
 *
 * Sequential to keep the modal sequence predictable. A single denial
 * does not abort subsequent claims; the caller can inspect the array
 * to decide whether to proceed.
 */
export async function claimResourceAllowances(
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!isInHost()) return Promise.resolve(false);
    const result = await hostApi.requestResourceAllocation(
    enumValue("v1", [
      enumValue("BulletinAllowance", undefined),
      enumValue("SmartContractAllowance", 0),
      enumValue("AutoSigning", undefined),
      enumValue("StatementStoreAllowance", undefined)
    ]),
  );

  const outcome = result.match(
    (response) => {
      const outcomes = ((response as { value?: unknown }).value as { tag?: string }[]) ?? [];
      const order = ["BulletinAllowance", "SmartContractAllowance(0)", "AutoSigning"] as const;
      outcomes.forEach((o, i) => console.info(`[allowances] ${order[i]}: ${o.tag ?? "unknown"}`));
      return true;
    },
    (err: unknown) => {
      console.warn("[allowances] requestResourceAllocation failed:", err);
      return false;
    },
  );
  return outcome;
}
