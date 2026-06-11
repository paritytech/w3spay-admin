import { afterEach, describe, expect, it, vi } from "vitest";

const reviveAddress = vi.fn();

vi.mock("@shared/chain/contracts/read.ts", () => ({
  reviveApi: () => ({ address: reviveAddress }),
}));

import {
  isAccountMapped,
  __resetAccountMappingCacheForTests,
} from "@shared/chain/contracts/account-mapping.ts";

const ADDR = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const H160 = "0xabc0000000000000000000000000000000000000";

function clientReturning(original: unknown) {
  const getValue = vi.fn(async () => original);
  const unsafeApi = { query: { Revive: { OriginalAccount: { getValue } } } };
  return { client: { getUnsafeApi: () => unsafeApi } as never, getValue };
}

afterEach(() => {
  __resetAccountMappingCacheForTests();
  vi.clearAllMocks();
});

describe("isAccountMapped", () => {
  it("memoizes a positive result so repeat writes skip the chainHead reads", async () => {
    reviveAddress.mockResolvedValue(H160);
    const { client, getValue } = clientReturning({ exists: true });

    expect(await isAccountMapped(client, ADDR)).toBe(true);
    expect(await isAccountMapped(client, ADDR)).toBe(true);

    expect(reviveAddress).toHaveBeenCalledTimes(1);
    expect(getValue).toHaveBeenCalledTimes(1);
  });

  it("treats the address case-insensitively for the cache key", async () => {
    reviveAddress.mockResolvedValue(H160);
    const { client } = clientReturning({ exists: true });

    expect(await isAccountMapped(client, ADDR)).toBe(true);
    expect(await isAccountMapped(client, ADDR.toUpperCase())).toBe(true);

    expect(reviveAddress).toHaveBeenCalledTimes(1);
  });

  it("never caches a negative result — an unmapped account can map mid-session", async () => {
    reviveAddress.mockResolvedValue(H160);
    const unmapped = clientReturning(undefined);
    expect(await isAccountMapped(unmapped.client, ADDR)).toBe(false);

    const mapped = clientReturning({ exists: true });
    expect(await isAccountMapped(mapped.client, ADDR)).toBe(true);
    expect(mapped.getValue).toHaveBeenCalledTimes(1);
  });

  it("returns false when the address has no H160 and does not cache it", async () => {
    reviveAddress.mockResolvedValue(null);
    const first = clientReturning({ exists: true });
    expect(await isAccountMapped(first.client, ADDR)).toBe(false);
    expect(first.getValue).not.toHaveBeenCalled();

    reviveAddress.mockResolvedValue(H160);
    const second = clientReturning({ exists: true });
    expect(await isAccountMapped(second.client, ADDR)).toBe(true);
  });
});
