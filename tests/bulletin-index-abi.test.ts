/**
 * Round-trip tests for the hand-maintained `T3rminalBulletinIndex` ABI.
 *
 * Goal: catch typos in `apps/w3spay-admin/src/contract/bulletin-index-abi.ts`
 * before they reach the chain (where the failure surfaces as an opaque
 * "data: 0x" revert). We exercise:
 *
 *   1. Every view method we use encodes + decodes cleanly via
 *      `ethers.Interface` with realistic argument shapes.
 *   2. Selectors don't collide with the merchant registry ABI — the
 *      admin app talks to both contracts and a hash collision would
 *      silently dispatch the wrong handler.
 *   3. The event matches the chain's signature (matters when we wire up
 *      live event subscriptions later).
 */

import { describe, expect, it } from "vitest";
import { ethers } from "ethers";

import { T3rminalBulletinIndexABI } from "@features/reports/contracts/bulletin-index-abi.ts";
import { W3SPayMerchantRegistryABI } from "@shared/chain/registry-abi.ts";

const iface = new ethers.Interface(T3rminalBulletinIndexABI);
const registryIface = new ethers.Interface(W3SPayMerchantRegistryABI);

const SHOPKEY = ("0x" + "ab".repeat(32)) as `0x${string}`;
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
  it("getAllDates(bytes32) encodes and decodes back to the same shopKey", () => {
    const data = iface.encodeFunctionData("getAllDates", [SHOPKEY]);
    const decoded = iface.decodeFunctionData("getAllDates", data);
    expect(decoded[0]?.toString().toLowerCase()).toBe(SHOPKEY);
  });

  it("getMetadata(bytes32, string) preserves both args", () => {
    const data = iface.encodeFunctionData("getMetadata", [SHOPKEY, DATE]);
    const decoded = iface.decodeFunctionData("getMetadata", data);
    expect(decoded[0]?.toString().toLowerCase()).toBe(SHOPKEY);
    expect(decoded[1]).toBe(DATE);
  });

  it("getCID(bytes32, string) preserves both args", () => {
    const data = iface.encodeFunctionData("getCID", [SHOPKEY, DATE]);
    const decoded = iface.decodeFunctionData("getCID", data);
    expect(decoded[0]?.toString().toLowerCase()).toBe(SHOPKEY);
    expect(decoded[1]).toBe(DATE);
  });

  it("getReportCount(bytes32) encodes and decodes back", () => {
    const data = iface.encodeFunctionData("getReportCount", [SHOPKEY]);
    const decoded = iface.decodeFunctionData("getReportCount", data);
    expect(decoded[0]?.toString().toLowerCase()).toBe(SHOPKEY);
  });

  it("decodes a synthetic getMetadata return tuple into the expected fields", () => {
    const cid = "bafytestcid";
    const entryCount = 7n;
    const publishedAt = 1716724800n;
    const exists = true;

    const encoded = iface.encodeFunctionResult("getMetadata", [
      [cid, entryCount, publishedAt, exists],
    ]);
    const [decoded] = iface.decodeFunctionResult("getMetadata", encoded) as readonly [{
      readonly cid: string;
      readonly entryCount: bigint;
      readonly publishedAt: bigint;
      readonly exists: boolean;
    }];
    expect(decoded.cid).toBe(cid);
    expect(decoded.entryCount).toBe(entryCount);
    expect(decoded.publishedAt).toBe(publishedAt);
    expect(decoded.exists).toBe(exists);
  });

  it("decodes a synthetic getAllDates return into the same string[]", () => {
    const dates = ["2026-05-24", "2026-05-25", "2026-05-26"];
    const encoded = iface.encodeFunctionResult("getAllDates", [dates]);
    const [decoded] = iface.decodeFunctionResult("getAllDates", encoded) as readonly [string[]];
    expect(decoded).toEqual(dates);
  });
});

describe("T3rminalBulletinIndexABI vs W3SPayMerchantRegistryABI selector collision", () => {
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
