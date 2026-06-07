import { describe, expect, it } from "vitest";

import { addressSetKey, queryKeys, queryRoots } from "@shared/chain/keys.ts";
import type { AccountId32Hex } from "@shared/lib/address.ts";

describe("query keys", () => {
  it("merchant-registry key carries network + address under the invalidation root", () => {
    const key = queryKeys.merchantRegistry("paseo-next-v2", "0xreg");
    expect(key).toEqual(["merchant-registry", "paseo-next-v2", "0xreg"]);
    expect(key[0]).toBe(queryRoots.merchantRegistry[0]);
  });

  it("is-admin key keeps a null H160 distinct from a resolved one", () => {
    expect(queryKeys.isAdmin(null, "0xreg")).toEqual(["is-admin", null, "0xreg"]);
    expect(queryKeys.isAdmin("0xadmin", "0xreg")).toEqual(["is-admin", "0xadmin", "0xreg"]);
  });

  it("daily-report key lowercases the shopKey so casing can't fork the cache", () => {
    expect(queryKeys.dailyReport("0xAbC", "2026-06-01")).toEqual([
      "daily-report",
      "0xabc",
      "2026-06-01",
    ]);
  });

  it("addressSetKey is order-independent", () => {
    const a = "0x11" as AccountId32Hex;
    const b = "0x22" as AccountId32Hex;
    expect(addressSetKey([a, b])).toBe(addressSetKey([b, a]));
  });

  it("every key factory's prefix equals its invalidation root (so writes invalidate reads)", () => {
    expect(queryKeys.tokenBalances("k")[0]).toBe(queryRoots.tokenBalances[0]);
    expect(queryKeys.itemConfigRegistry("acc")[0]).toBe(queryRoots.itemConfigRegistry[0]);
    expect(queryKeys.reportIndex("shop")[0]).toBe(queryRoots.reportIndex[0]);
    expect(queryKeys.dailyReport("shop", "date")[0]).toBe(queryRoots.dailyReport[0]);
    expect(queryKeys.isAdmin(null, "r")[0]).toBe(queryRoots.isAdmin[0]);
  });
});
