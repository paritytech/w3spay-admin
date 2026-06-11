// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { PolkadotSigner } from "polkadot-api";

import { runExclusiveHostModal } from "./connection.ts";
import { enumValue, hostApi } from "./host-api.ts";

const SIGN_RESPONSE_WARN_MS = 5_000;
const PING_TIMEOUT_MS = 3_000;
const QUEUE_WAIT_LOG_MS = 250;
const HANDSHAKE_PROTOCOL_VERSION = 1;

export interface GuardedHostSignerDeps {
  readonly runExclusive: <T>(task: () => PromiseLike<T>) => Promise<T>;
  /** Resolves `true` iff the host bridge answered within `timeoutMs`. */
  readonly ping: (timeoutMs: number) => Promise<boolean>;
  readonly warnAfterMs: number;
  readonly pingTimeoutMs: number;
}

/**
 * Round-trips a `host_handshake` over the same transport the signer uses —
 * hosts answer it at any point in the session. ANY settle (ok or error)
 * proves the bridge delivers both ways; only silence means a dead channel.
 */
function pingHostBridge(timeoutMs: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => resolve(false), timeoutMs);
  const settle = () => {
    clearTimeout(timer);
    resolve(true);
  };
  void Promise.resolve(
    hostApi.handshake(enumValue("v1", HANDSHAKE_PROTOCOL_VERSION)),
  ).then(settle, settle);
  return promise;
}

const DEFAULT_DEPS: GuardedHostSignerDeps = {
  runExclusive: runExclusiveHostModal,
  ping: pingHostBridge,
  warnAfterMs: SIGN_RESPONSE_WARN_MS,
  pingTimeoutMs: PING_TIMEOUT_MS,
};

/**
 * Wraps a host `PolkadotSigner` so its prompts survive the host's
 * one-modal-at-a-time policy: the host SILENTLY DROPS a modal request that
 * arrives while another modal is open (see `runExclusiveHostModal`), and
 * `signTx` is invoked deep inside PAPI's `signSubmitAndWatch`, bypassing the
 * FIFO every other modal in the app already uses. A signing prompt racing
 * e.g. a boot-time permission prompt vanished, wedging the UI at
 * "Waiting for signature…".
 *
 * Once dispatched, a watchdog probes the bridge if the wallet stays silent:
 * a responsive bridge means the prompt is up and the user is slow (keep
 * waiting); a silent bridge means the request is lost — reject fast with an
 * actionable error instead of burning the full signing timeout.
 */
export function createGuardedHostSigner(
  inner: PolkadotSigner,
  overrides: Partial<GuardedHostSignerDeps> = {},
): PolkadotSigner {
  const deps: GuardedHostSignerDeps = { ...DEFAULT_DEPS, ...overrides };

  function guard<Args extends unknown[], Out>(
    label: "signTx" | "signBytes",
    call: (...args: Args) => Promise<Out>,
  ): (...args: Args) => Promise<Out> {
    return (...args) => {
      const enqueuedAt = Date.now();
      return deps.runExclusive(async () => {
        const queueWaitMs = Date.now() - enqueuedAt;
        if (queueWaitMs > QUEUE_WAIT_LOG_MS) {
          console.info(
            `[host-signer] ${label}: dispatched after waiting ${queueWaitMs}ms behind another host modal`,
          );
        }
        const dispatchedAt = Date.now();
        let settled = false;

        const { promise: lostChannel, reject: failLostChannel } =
          Promise.withResolvers<never>();
        lostChannel.catch(() => {});

        const watchdog = setTimeout(() => {
          void (async () => {
            console.warn(
              `[host-signer] ${label}: no wallet response after ${deps.warnAfterMs}ms — probing host bridge`,
            );
            const alive = await deps.ping(deps.pingTimeoutMs);
            if (settled) return;
            if (alive) {
              console.info(
                `[host-signer] ${label}: bridge is responsive — the signing prompt should be open, waiting on the user`,
              );
            } else {
              console.error(
                `[host-signer] ${label}: bridge did not answer a handshake within ${deps.pingTimeoutMs}ms — signing request presumed lost`,
              );
              failLostChannel(
                new Error(
                  "Signing request appears lost: the host bridge stopped responding. " +
                    "Close and reopen the app (or reconnect the wallet), then try again.",
                ),
              );
            }
          })();
        }, deps.warnAfterMs);

        try {
          const result = await Promise.race([call(...args), lostChannel]);
          console.info(
            `[host-signer] ${label}: wallet responded in ${Date.now() - dispatchedAt}ms`,
          );
          return result;
        } catch (caught) {
          console.warn(
            `[host-signer] ${label}: failed after ${Date.now() - dispatchedAt}ms`,
            caught,
          );
          throw caught;
        } finally {
          settled = true;
          clearTimeout(watchdog);
        }
      });
    };
  }

  return {
    publicKey: inner.publicKey,
    signTx: guard("signTx", inner.signTx.bind(inner)),
    signBytes: guard("signBytes", inner.signBytes.bind(inner)),
  };
}
