import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { PolkadotSigner } from "polkadot-api";

import {
  __resetHostModalQueueForTests,
  runExclusiveHostModal,
} from "@shared/chain/host/connection.ts";
import { createGuardedHostSigner } from "@shared/chain/host/guarded-signer.ts";

function makeInner(
  signTxImpl?: () => Promise<Uint8Array>,
): PolkadotSigner & { signTx: Mock; signBytes: Mock } {
  return {
    publicKey: new Uint8Array(32),
    signTx: vi.fn(signTxImpl ?? (async () => new Uint8Array([7]))),
    signBytes: vi.fn(async () => new Uint8Array([8])),
  } as unknown as PolkadotSigner & { signTx: Mock; signBytes: Mock };
}

function signTxArgs(): [Uint8Array, Record<string, never>, Uint8Array, number] {
  return [new Uint8Array(), {}, new Uint8Array(), 0];
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  __resetHostModalQueueForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("createGuardedHostSigner", () => {
  it("serializes signTx behind an open host modal instead of dispatching into the void", async () => {
    vi.useFakeTimers();
    let releaseModal!: () => void;
    void runExclusiveHostModal(() => new Promise<void>((r) => (releaseModal = r)));
    const inner = makeInner();
    const guarded = createGuardedHostSigner(inner, { ping: async () => true });

    const result = guarded.signTx(...signTxArgs());
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.signTx).not.toHaveBeenCalled();

    releaseModal();
    await vi.advanceTimersByTimeAsync(0);
    expect(inner.signTx).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual(new Uint8Array([7]));
  });

  it("rejects fast when the wallet is silent and the bridge does not answer the probe", async () => {
    vi.useFakeTimers();
    const inner = makeInner(() => new Promise<Uint8Array>(() => {}));
    const guarded = createGuardedHostSigner(inner, {
      runExclusive: (task) => Promise.resolve(task()),
      ping: async () => false,
      warnAfterMs: 5_000,
      pingTimeoutMs: 3_000,
    });

    const result = guarded.signTx(...signTxArgs());
    result.catch(() => {});

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).rejects.toThrow(/Signing request appears lost/);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("signing request presumed lost"),
    );
  });

  it("keeps waiting when the bridge answers the probe and resolves once the user signs", async () => {
    vi.useFakeTimers();
    let resolveInner!: (value: Uint8Array) => void;
    const inner = makeInner(
      () => new Promise<Uint8Array>((r) => (resolveInner = r)),
    );
    const guarded = createGuardedHostSigner(inner, {
      runExclusive: (task) => Promise.resolve(task()),
      ping: async () => true,
      warnAfterMs: 5_000,
      pingTimeoutMs: 3_000,
    });

    const result = guarded.signTx(...signTxArgs());

    await vi.advanceTimersByTimeAsync(60_000);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("probing host bridge"),
    );

    resolveInner(new Uint8Array([9]));
    await expect(result).resolves.toEqual(new Uint8Array([9]));
  });

  it("routes signBytes through the same guard", async () => {
    const inner = makeInner();
    const guarded = createGuardedHostSigner(inner, { ping: async () => true });

    await expect(guarded.signBytes(new Uint8Array([1]))).resolves.toEqual(
      new Uint8Array([8]),
    );
    expect(inner.signBytes).toHaveBeenCalledTimes(1);
  });
});
