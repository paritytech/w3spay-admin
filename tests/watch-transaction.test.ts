import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { PolkadotSigner, TxEvent } from "polkadot-api";

import {
  watchTransaction,
  type TxStatus,
  type WatchableTx,
} from "@shared/chain/contracts/watch-transaction.ts";

interface AttemptHandle {
  observer: { next(event: TxEvent): void; error(error: unknown): void };
  signer: PolkadotSigner;
  unsubscribed: boolean;
}

function makeTx(): { tx: WatchableTx; attempts: AttemptHandle[] } {
  const attempts: AttemptHandle[] = [];
  const tx: WatchableTx = {
    signSubmitAndWatch(signer) {
      const handle: AttemptHandle = {
        observer: { next: () => {}, error: () => {} },
        signer,
        unsubscribed: false,
      };
      attempts.push(handle);
      return {
        subscribe(observer) {
          handle.observer = observer;
          return {
            unsubscribe() {
              handle.unsubscribed = true;
            },
          };
        },
      };
    },
  };
  return { tx, attempts };
}

function makeSigner(
  signTxImpl?: () => Promise<Uint8Array>,
): PolkadotSigner & { signTx: Mock } {
  return {
    publicKey: new Uint8Array(32),
    signTx: vi.fn(signTxImpl ?? (async () => new Uint8Array([1]))),
    signBytes: vi.fn(async () => new Uint8Array()),
  } as unknown as PolkadotSigner & { signTx: Mock };
}

function invokeSigner(handle: AttemptHandle): Promise<Uint8Array> {
  return handle.signer.signTx(new Uint8Array(), {}, new Uint8Array(), 0);
}

const event = (e: Record<string, unknown>) => e as unknown as TxEvent;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("watchTransaction", () => {
  it("emits preparing at subscribe and signing only at signer handoff, then resolves on inclusion", async () => {
    const { tx, attempts } = makeTx();
    const signer = makeSigner();
    const statuses: TxStatus[] = [];

    const promise = watchTransaction(tx, signer, (s) => statuses.push(s));
    expect(statuses).toEqual(["preparing"]);
    expect(attempts).toHaveLength(1);

    await invokeSigner(attempts[0]);
    expect(statuses).toEqual(["preparing", "signing"]);
    expect(signer.signTx).toHaveBeenCalledTimes(1);

    attempts[0].observer.next(event({ type: "signed" }));
    attempts[0].observer.next(event({ type: "broadcasted", txHash: "0xabc" }));
    attempts[0].observer.next(
      event({ type: "txBestBlocksState", found: true, ok: true, txHash: "0xabc" }),
    );

    await expect(promise).resolves.toBe("0xabc");
    expect(statuses).toEqual([
      "preparing",
      "signing",
      "broadcasting",
      "broadcasting",
      "in-block",
    ]);
  });

  it("re-subscribes once when assembly never reaches the signer, then completes", async () => {
    vi.useFakeTimers();
    const { tx, attempts } = makeTx();
    const signer = makeSigner();

    const promise = watchTransaction(tx, signer);
    expect(attempts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(attempts).toHaveLength(2);
    expect(attempts[0].unsubscribed).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("did not reach the signer"),
    );

    await invokeSigner(attempts[1]);
    attempts[1].observer.next(
      event({ type: "txBestBlocksState", found: true, ok: true, txHash: "0xdef" }),
    );
    await expect(promise).resolves.toBe("0xdef");
  });

  it("fails with a descriptive error when every attempt stalls before the signer", async () => {
    vi.useFakeTimers();
    const { tx, attempts } = makeTx();
    const statuses: TxStatus[] = [];

    const promise = watchTransaction(tx, makeSigner(), (s) => statuses.push(s));
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(attempts).toHaveLength(2);
    await expect(promise).rejects.toThrow(/transaction build stalled/);
    expect(statuses.at(-1)).toBe("error");
  });

  it("rejects a superseded attempt's signer handoff without reaching the wallet", async () => {
    vi.useFakeTimers();
    const { tx, attempts } = makeTx();
    const signer = makeSigner();

    const promise = watchTransaction(tx, signer);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10_000);
    expect(attempts).toHaveLength(2);

    await expect(invokeSigner(attempts[0])).rejects.toThrow(
      /superseded transaction attempt/,
    );
    expect(signer.signTx).not.toHaveBeenCalled();
  });

  it("warns and then times out when the wallet never answers after handoff", async () => {
    vi.useFakeTimers();
    const { tx, attempts } = makeTx();
    const signer = makeSigner(() => new Promise<Uint8Array>(() => {}));

    const promise = watchTransaction(tx, signer);
    promise.catch(() => {});
    invokeSigner(attempts[0]).catch(() => {});

    await vi.advanceTimersByTimeAsync(15_000);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("no wallet response"),
    );

    await vi.advanceTimersByTimeAsync(105_000);
    await expect(promise).rejects.toThrow(/signing request timed out/);
  });

  it("fails via the inclusion watchdog when broadcast never follows signed", async () => {
    vi.useFakeTimers();
    const { tx, attempts } = makeTx();

    const promise = watchTransaction(tx, makeSigner());
    promise.catch(() => {});
    await invokeSigner(attempts[0]);
    attempts[0].observer.next(event({ type: "signed" }));

    await vi.advanceTimersByTimeAsync(120_000);
    await expect(promise).rejects.toThrow(/no inclusion within/);
    expect(attempts).toHaveLength(1);
  });

  it("fails with the dispatch error when the transaction reverts in block", async () => {
    const { tx, attempts } = makeTx();

    const promise = watchTransaction(tx, makeSigner());
    promise.catch(() => {});
    await invokeSigner(attempts[0]);
    attempts[0].observer.next(
      event({
        type: "txBestBlocksState",
        found: true,
        ok: false,
        dispatchError: "Module.OutOfGas",
      }),
    );

    await expect(promise).rejects.toThrow(/transaction failed in block: Module.OutOfGas/);
  });
});
