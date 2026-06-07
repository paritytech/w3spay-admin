import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Stub of the neverthrow `ResultAsync` surface that `permissions.ts` calls.
 * Only `.match(onOk, onErr)` is used; we resolve to whichever branch matches
 * the stub kind so callers can synchronously construct ok / err fixtures.
 */
function okStub<T, E>(value: T) {
  return {
    match<A, B = A>(onOk: (v: T) => A, _onErr: (e: E) => B): Promise<A | B> {
      return Promise.resolve(onOk(value));
    },
  };
}

function errStub<T, E>(error: E) {
  return {
    match<A, B = A>(_onOk: (v: T) => A, onErr: (e: E) => B): Promise<A | B> {
      return Promise.resolve(onErr(error));
    },
  };
}

const featureSupported = vi.fn();
const requestPermission = vi.fn();
const enumValue = vi.fn((tag: string, value: unknown) => ({ tag, value }));

vi.mock("@/shared/chain/host", () => ({
  hostApi: {
    get featureSupported() {
      return featureSupported;
    },
  },
  requestPermission,
  enumValue,
  // permissions.ts serializes the prompt through the host-modal queue;
  // run the task inline so the existing call/grant assertions still hold.
  runExclusiveHostModal: <T,>(task: () => PromiseLike<T>) => Promise.resolve(task()),
}));

const { checkHostChainSupport, requestRemotePermission } = await import(
  "@features/session/permissions.ts"
);

const GENESIS = "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2";

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkHostChainSupport", () => {
  it("returns supported when the host advertises the chain", async () => {
    featureSupported.mockReturnValueOnce(okStub({ tag: "v1", value: true }));

    const result = await checkHostChainSupport(GENESIS);

    expect(result).toEqual({ kind: "supported" });
    expect(featureSupported).toHaveBeenCalledTimes(1);
    expect(featureSupported).toHaveBeenCalledWith({
      tag: "v1",
      value: { tag: "Chain", value: GENESIS },
    });
  });

  it("returns unsupported when the host does not advertise the chain", async () => {
    featureSupported.mockReturnValueOnce(okStub({ tag: "v1", value: false }));

    const result = await checkHostChainSupport(GENESIS);

    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.reason).toContain(GENESIS);
    }
  });

  it("returns unavailable when the host transport errors", async () => {
    featureSupported.mockReturnValueOnce(
      errStub({
        tag: "v1",
        value: { payload: { reason: "transport dead" } },
      }),
    );

    const result = await checkHostChainSupport(GENESIS);

    expect(result).toEqual({ kind: "unavailable", reason: "transport dead" });
  });
});

describe("requestRemotePermission", () => {
  it("forwards the inner enum variant for ChainSubmit and surfaces a grant", async () => {
    requestPermission.mockReturnValueOnce(okStub(true));

    const outcome = await requestRemotePermission("ChainSubmit");

    expect(outcome).toEqual({ granted: true });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    // product-sdk's requestPermission wraps in enumValue("v1", ...) itself,
    // so we pass only the inner enum variant.
    expect(requestPermission).toHaveBeenCalledWith({
      tag: "ChainSubmit",
      value: undefined,
    });
  });

  it("surfaces an explicit user denial as granted=false without error", async () => {
    requestPermission.mockReturnValueOnce(okStub(false));

    const outcome = await requestRemotePermission("ChainSubmit");

    expect(outcome).toEqual({ granted: false });
  });

  it("captures the host error reason when the transport fails", async () => {
    requestPermission.mockReturnValueOnce(
      errStub({ payload: { reason: "bridge offline" } }),
    );

    const outcome = await requestRemotePermission("StatementSubmit");

    expect(outcome).toEqual({ granted: false, error: "bridge offline" });
    expect(requestPermission).toHaveBeenCalledWith({
      tag: "StatementSubmit",
      value: undefined,
    });
  });
});
