import { describe, expect, it } from "vitest";
import { ethers } from "ethers";

import { T3rminalBulletinIndexABI } from "@features/reports/contracts/bulletin-index-abi.ts";
import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";

const iface = new ethers.Interface(T3rminalBulletinIndexABI);
const registryIface = new ethers.Interface(W3SPayRegistryABI);

const MERCHANT = "merchant-001";
const TERMINAL = "t3r-abc123";
const DATE = "2026-05-26";

describe("T3rminalBulletinIndexABI shape", () => {
  it("exposes each view function we read from the admin", () => {
    expect(iface.getFunction("getAllDates")).toBeTruthy();
    expect(iface.getFunction("getMetadata")).toBeTruthy();
    expect(iface.getFunction("getCID")).toBeTruthy();
    expect(iface.getFunction("getReportCount")).toBeTruthy();
  });

  it("exposes the DailyReportStored event", () => {
    expect(iface.getEvent("DailyReportStored")).toBeTruthy();
  });
});

describe("T3rminalBulletinIndexABI encode/decode round-trips", () => {
  it("getAllDates(string,string) preserves merchantId and terminalId", () => {
    const data = iface.encodeFunctionData("getAllDates", [MERCHANT, TERMINAL]);
    const decoded = iface.decodeFunctionData("getAllDates", data);
    expect(decoded[0]).toBe(MERCHANT);
    expect(decoded[1]).toBe(TERMINAL);
  });

  it("getMetadata(string,string,string) preserves all three args", () => {
    const data = iface.encodeFunctionData("getMetadata", [MERCHANT, TERMINAL, DATE]);
    const decoded = iface.decodeFunctionData("getMetadata", data);
    expect(decoded[0]).toBe(MERCHANT);
    expect(decoded[1]).toBe(TERMINAL);
    expect(decoded[2]).toBe(DATE);
  });

  it("getCID(string,string,string) preserves all three args", () => {
    const data = iface.encodeFunctionData("getCID", [MERCHANT, TERMINAL, DATE]);
    const decoded = iface.decodeFunctionData("getCID", data);
    expect(decoded[0]).toBe(MERCHANT);
    expect(decoded[1]).toBe(TERMINAL);
    expect(decoded[2]).toBe(DATE);
  });

  it("getReportCount(string,string) preserves merchantId and terminalId", () => {
    const data = iface.encodeFunctionData("getReportCount", [MERCHANT, TERMINAL]);
    const decoded = iface.decodeFunctionData("getReportCount", data);
    expect(decoded[0]).toBe(MERCHANT);
    expect(decoded[1]).toBe(TERMINAL);
  });

  it("decodes a synthetic getMetadata return tuple into the expected fields", () => {
    const cid = "bafytestcid";
    const entryCount = 7n;
    const publishedAt = 1716724800n;
    const finalized = false;
    const exists = true;

    const encoded = iface.encodeFunctionResult("getMetadata", [
      [cid, entryCount, publishedAt, TERMINAL, finalized, exists],
    ]);
    const [decoded] = iface.decodeFunctionResult("getMetadata", encoded) as readonly [{
      readonly cid: string;
      readonly entryCount: bigint;
      readonly publishedAt: bigint;
      readonly terminalId: string;
      readonly finalized: boolean;
      readonly exists: boolean;
    }];
    expect(decoded.cid).toBe(cid);
    expect(decoded.entryCount).toBe(entryCount);
    expect(decoded.publishedAt).toBe(publishedAt);
    expect(decoded.terminalId).toBe(TERMINAL);
    expect(decoded.finalized).toBe(finalized);
    expect(decoded.exists).toBe(exists);
  });

  it("decodes a synthetic getAllDates return into the same string[]", () => {
    const dates = ["2026-05-24", "2026-05-25", "2026-05-26"];
    const encoded = iface.encodeFunctionResult("getAllDates", [dates]);
    const [decoded] = iface.decodeFunctionResult("getAllDates", encoded) as readonly [string[]];
    expect(decoded).toEqual(dates);
  });
});

describe("T3rminalBulletinIndexABI vs W3SPayRegistryABI selector collision", () => {
  const bulletinNames = ["getAllDates", "getMetadata", "getCID", "getReportCount"] as const;

  it("each bulletin selector is distinct", () => {
    const selectors = bulletinNames.map((name) => iface.getFunction(name)?.selector);
    const unique = new Set(selectors);
    expect(unique.size).toBe(selectors.length);
  });

  it("no bulletin selector collides with any registry function selector", () => {
    const bulletinSelectors = new Set(
      bulletinNames.map((name) => iface.getFunction(name)?.selector ?? ""),
    );
    const registryFragments = registryIface.fragments.filter((f) => f.type === "function");
    for (const frag of registryFragments) {
      const sel = registryIface.getFunction(frag.name)?.selector;
      if (sel) {
        expect(bulletinSelectors.has(sel)).toBe(false);
      }
    }
  });
});
