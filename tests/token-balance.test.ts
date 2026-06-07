import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { envConfig } from "@shared/config";
import type { AccountId32Hex } from "@shared/lib/address.ts";
import {
  fetchTokenBalance,
  formatTokenAmount,
  PeopleChainUnavailableError,
} from "@features/balances/contracts/token-balance.ts";

// ── Mocks ─────────────────────────────────────────────────────────────────
//
// Shared mock state is created with `vi.hoisted` so it is initialised
// alongside the (hoisted) `vi.mock` factories below. That lets the
// module-under-test be imported with a normal static `import` while still
// observing the mocks — no `await import()` dance required.
const mocks = vi.hoisted(() => {
  const getValue =
    vi.fn<
      (
        location: unknown,
        ss58: string,
        opts?: { at?: "best" | "finalized" },
      ) => Promise<{ balance: bigint } | undefined>
    >();
  const peopleClient = {
    client: {},
    unsafeApi: { query: { Assets: { Account: { getValue } } } },
  };
  return {
    getValue,
    peopleClient,
    accountId32HexToSs58: vi.fn((hex: string) => `ss58:${hex.slice(2, 10)}`),
    // Mutable so individual tests can simulate "no people chain" (null).
    ref: { current: peopleClient as typeof peopleClient | null },
  };
});

vi.mock("@shared/chain/client.ts", () => ({
  usePeopleClient: () => mocks.ref.current,
}));

vi.mock("@shared/lib/address.ts", () => ({
  accountId32HexToSs58: mocks.accountId32HexToSs58,
}));

const TOKEN_LOCATION = envConfig.token.location;
const TOKEN_SYMBOL = envConfig.token.symbol;

const ADDR_A = ("0x" + "11".repeat(32)) as AccountId32Hex;
const ADDR_B = ("0x" + "22".repeat(32)) as AccountId32Hex;

beforeEach(() => {
  mocks.getValue.mockReset();
  mocks.ref.current = mocks.peopleClient;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── config wiring ─────────────────────────────────────────────────────────

describe("token config", () => {
  it("defaults to CASH", () => {
    expect(TOKEN_SYMBOL).toBe("CASH");
  });
});

// ── fetchTokenBalance ─────────────────────────────────────────────────────

describe("fetchTokenBalance", () => {
  it("queries the people chain's Assets.Account with the token location + ss58 derived from the AccountId32", async () => {
    mocks.getValue.mockResolvedValue({ balance: 1_234_560n });

    const balance = await fetchTokenBalance(ADDR_A);

    expect(balance).toBe(1_234_560n);
    expect(mocks.getValue).toHaveBeenCalledTimes(1);
    const [location, ss58, opts] = mocks.getValue.mock.calls[0] as unknown as [
      typeof TOKEN_LOCATION,
      string,
      { at: "best" | "finalized" } | undefined,
    ];
    // The first storage key is the XCM Location (foreign-asset id), NOT a
    // numeric assetId — this is the pallet-assets shape on the people chain.
    expect(location).toBe(TOKEN_LOCATION);
    expect(ss58).toBe(mocks.accountId32HexToSs58.mock.results[0]?.value);
    expect(opts).toEqual({ at: "best" });
  });

  it("returns 0n when the account has no Assets row", async () => {
    mocks.getValue.mockResolvedValue(undefined);
    await expect(fetchTokenBalance(ADDR_A)).resolves.toBe(0n);
  });

  it("throws PeopleChainUnavailableError when the active network has no people chain", async () => {
    mocks.ref.current = null;
    await expect(fetchTokenBalance(ADDR_A)).rejects.toBeInstanceOf(PeopleChainUnavailableError);
  });
});

// ── formatTokenAmount ─────────────────────────────────────────────────────

describe("formatTokenAmount", () => {
  it("formats whole + fractional token amounts with 6-decimal planck input", () => {
    expect(formatTokenAmount(0n)).toBe("0.00");
    expect(formatTokenAmount(1_000_000n)).toBe("1.00");
    expect(formatTokenAmount(1_234_560n)).toBe("1.23456");
    expect(formatTokenAmount(999n)).toBe("0.000999");
    expect(formatTokenAmount(1_500_000n)).toBe("1.50");
  });

  it("renders unknown balances as an em dash so empty cache cells stay uniform", () => {
    expect(formatTokenAmount(undefined)).toBe("—");
  });
});

// The former module-level `balanceCache` is gone — caching now lives in
// the TanStack Query layer (`lib/query/balance-queries.ts`), so the
// pure read fns above are the full surface this module still owns.
