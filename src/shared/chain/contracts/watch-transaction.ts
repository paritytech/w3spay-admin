// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { PolkadotSigner, TxEvent } from "polkadot-api";

import { stringifyResultValue } from "./read.ts";
import { withTimeout } from "./with-timeout.ts";

export type TxStatus =
  | "idle"
  | "preparing"
  | "signing"
  | "broadcasting"
  | "in-block"
  | "finalized"
  | "error";

export interface WatchableTx {
  readonly decodedCall?: unknown;
  signSubmitAndWatch(
    signer: PolkadotSigner,
    options?: unknown,
  ): {
    subscribe(observer: {
      next(event: TxEvent): void;
      error(error: unknown): void;
    }): { unsubscribe(): void };
  };
}
export type ChainEffectOracle = () => Promise<boolean>;

export interface WatchTransactionOptions {
  /**
   * Workaround for chains where `chainHead_v1_follow` doesn't deliver
   * `txBestBlocksState` through the host bridge.
   */
  waitForChainEffect?: ChainEffectOracle;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  /** Budget for the wallet to answer once the signer holds the payload. */
  signingTimeoutMs?: number;
  /** Per-attempt budget for tx assembly to reach the signer. */
  prepareTimeoutMs?: number;
  /** Re-subscribes allowed when assembly never reaches the signer. */
  prepareRetries?: number;
}

interface TxBestBlocksEvent {
  type: "txBestBlocksState";
  found?: boolean;
  ok?: boolean;
  txHash?: string;
  dispatchError?: unknown;
}

interface TxFinalizedEvent {
  type: "finalized";
  ok?: boolean;
  txHash?: string;
  dispatchError?: unknown;
}

/** Refreshed on every chain event and completed poll — a responsive node keeps it from firing. */
const POST_BROADCAST_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const SIGNING_TIMEOUT_MS = 120_000;
const SIGNING_WARN_MS = 15_000;
const PREPARE_TIMEOUT_MS = 10_000;
const PREPARE_RETRIES = 1;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function watchTransaction(
  tx: WatchableTx,
  signer: PolkadotSigner,
  onStatus?: (status: TxStatus) => void,
  options: WatchTransactionOptions = {},
): Promise<`0x${string}`> {
  const { promise, resolve, reject } = Promise.withResolvers<`0x${string}`>();
  const signingTimeoutMs = options.signingTimeoutMs ?? SIGNING_TIMEOUT_MS;
  const prepareTimeoutMs = options.prepareTimeoutMs ?? PREPARE_TIMEOUT_MS;
  const maxAttempts = 1 + (options.prepareRetries ?? PREPARE_RETRIES);
  const startedAt = Date.now();

  let settled = false;
  let pollLoopStopped = false;
  let signerReached = false;
  let attempt = 0;
  let broadcastedHash: `0x${string}` | undefined;
  let subscription: { unsubscribe(): void } | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let prepareTimer: ReturnType<typeof setTimeout> | undefined;
  let signingWarnTimer: ReturnType<typeof setTimeout> | undefined;
  let signingTimer: ReturnType<typeof setTimeout> | undefined;

  const clearStall = () => {
    if (stallTimer !== undefined) {
      clearTimeout(stallTimer);
      stallTimer = undefined;
    }
  };

  const clearPrepare = () => {
    if (prepareTimer !== undefined) {
      clearTimeout(prepareTimer);
      prepareTimer = undefined;
    }
  };

  const clearSigning = () => {
    if (signingWarnTimer !== undefined) {
      clearTimeout(signingWarnTimer);
      signingWarnTimer = undefined;
    }
    if (signingTimer !== undefined) {
      clearTimeout(signingTimer);
      signingTimer = undefined;
    }
  };

  const safeUnsubscribe = () => {
    try {
      subscription?.unsubscribe();
    } catch {
      // Best-effort — observable may already be closed.
    }
  };

  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    pollLoopStopped = true;
    clearStall();
    clearPrepare();
    clearSigning();
    onStatus?.("error");
    try {
      subscription?.unsubscribe();
    } finally {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const succeed = (txHash: `0x${string}`) => {
    if (settled) return;
    settled = true;
    pollLoopStopped = true;
    clearStall();
    clearPrepare();
    clearSigning();
    onStatus?.("in-block");
    resolve(txHash);
  };

  const armStall = () => {
    clearStall();
    stallTimer = setTimeout(() => {
      fail(
        new Error(
          `transaction stalled: no inclusion within ${POST_BROADCAST_TIMEOUT_MS}ms of broadcast`,
        ),
      );
    }, POST_BROADCAST_TIMEOUT_MS);
  };

  const startPolling = () => {
    const probe = options.waitForChainEffect;
    if (!probe) return;
    const interval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

    void (async () => {
      // Yield one microtask so a same-tick event-path resolution can
      // flip `pollLoopStopped` and pre-empt polling entirely.
      await Promise.resolve();
      while (!pollLoopStopped && !settled) {
        try {
          const landed = await withTimeout(probe(), timeout, "waitForChainEffect");
          if (!settled) armStall();
          if (landed) {
            succeed(broadcastedHash ?? ("0x" as `0x${string}`));
            safeUnsubscribe();
            return;
          }
        } catch (caught) {
          console.warn("[watch-transaction] effect poll error (continuing)", caught);
        }
        if (pollLoopStopped || settled) return;
        await sleep(interval);
      }
    })();
  };

  const onSignerHandoff = () => {
    signerReached = true;
    clearPrepare();
    console.info(
      `[watch-transaction] signer handoff after ${Date.now() - startedAt}ms — waiting for wallet response`,
    );
    onStatus?.("signing");
    signingWarnTimer = setTimeout(() => {
      console.warn(
        `[watch-transaction] no wallet response ${SIGNING_WARN_MS}ms after signer handoff — ` +
          `if no signing prompt is visible the request may be lost; failing in ${signingTimeoutMs - SIGNING_WARN_MS}ms`,
      );
    }, SIGNING_WARN_MS);
    signingTimer = setTimeout(() => {
      fail(
        new Error(
          `signing request timed out: no wallet response within ${signingTimeoutMs}ms ` +
            "(the host signing prompt may not have appeared — reconnect the wallet and try again)",
        ),
      );
    }, signingTimeoutMs);
  };

  const guardSigner = (forAttempt: number): PolkadotSigner => {
    const signTx: PolkadotSigner["signTx"] = (...args) => {
      // A superseded attempt must never reach the wallet: the live attempt
      // owns the (single) signing prompt.
      if (settled || forAttempt !== attempt) {
        return Promise.reject(new Error("superseded transaction attempt"));
      }
      onSignerHandoff();
      return signer.signTx(...args);
    };
    return {
      publicKey: signer.publicKey,
      signBytes: signer.signBytes.bind(signer),
      signTx,
    };
  };

  const armPrepare = (forAttempt: number) => {
    clearPrepare();
    prepareTimer = setTimeout(() => {
      if (settled || signerReached || forAttempt !== attempt) return;
      if (attempt < maxAttempts) {
        console.warn(
          `[watch-transaction] tx assembly did not reach the signer within ${prepareTimeoutMs}ms ` +
            `(attempt ${attempt}/${maxAttempts}) — re-submitting`,
        );
        safeUnsubscribe();
        subscribeAttempt();
        return;
      }
      fail(
        new Error(
          `transaction build stalled: signer was never invoked within ${prepareTimeoutMs}ms ` +
            `(${maxAttempts} attempts) — chain-state reads (nonce/metadata) appear stuck; ` +
            "check the connection and try again",
        ),
      );
    }, prepareTimeoutMs);
  };

  const handleEvent = (event: TxEvent) => {
    clearPrepare();
    clearSigning();
    const evt = event as {
      type: string;
      found?: boolean;
      ok?: boolean;
      txHash?: string;
    };
    console.info("[watch-transaction] tx event", {
      type: evt.type,
      found: evt.found,
      ok: evt.ok,
      txHash: evt.txHash,
    });

    if (event.type === "signed") {
      // Without this, a hang between `signed` and `broadcasted` had no
      // watchdog running at all.
      onStatus?.("broadcasting");
      armStall();
    }
    if (event.type === "broadcasted") {
      onStatus?.("broadcasting");
      armStall();
      broadcastedHash = evt.txHash as `0x${string}` | undefined;
      startPolling();
    }

    if (event.type === "txBestBlocksState") {
      armStall();
      const ev = event as TxBestBlocksEvent;
      if (ev.found) {
        if (ev.ok === false) {
          fail(new Error(`transaction failed in block: ${formatDispatchError(ev.dispatchError)}`));
          return;
        }
        succeed((ev.txHash ?? "0x") as `0x${string}`);
      }
    }

    if (event.type === "finalized") {
      const ev = event as TxFinalizedEvent;
      if (!settled) {
        if (ev.ok === false) {
          fail(new Error(`transaction finalized with dispatch error: ${formatDispatchError(ev.dispatchError)}`));
          return;
        }
        succeed((ev.txHash ?? "0x") as `0x${string}`);
      }
      onStatus?.("finalized");
      safeUnsubscribe();
    }
  };

  const subscribeAttempt = () => {
    attempt += 1;
    armPrepare(attempt);
    subscription = tx
      .signSubmitAndWatch(guardSigner(attempt), { mortality: { mortal: true, period: 256 } })
      .subscribe({
        next(event) {
          handleEvent(event);
        },
        error(error) {
          fail(error);
        },
      });
  };

  onStatus?.("preparing");
  subscribeAttempt();

  return promise;
}

function formatDispatchError(error: unknown): string {
  if (error == null) return "unknown dispatch error";
  if (typeof error === "string") return error;
  return stringifyResultValue(error);
}
