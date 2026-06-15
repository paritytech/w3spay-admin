/**
 * Read-side contract for the T3rminal bulletin index. Guards the call shape
 * that regressed: the deployed contract keys reports on (merchantId, terminalId)
 * — never a single precomputed key — so every view call must forward the raw
 * identity strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { Binary } from "polkadot-api";

const reviveCall = vi.fn();

vi.mock("@shared/chain/use-client.ts", () => ({
  useMainClient: () => ({
    client: {
      getUnsafeApi: () => ({
        apis: { ReviveApi: { call: reviveCall, address: vi.fn() } },
      }),
    },
    unsafeApi: undefined,
  }),
  resetMainClient: vi.fn(),
}));

import { fetchTerminalReportIndex } from "@features/reports/contracts/bulletin-index-read.ts";
import { T3rminalBulletinIndexABI } from "@features/reports/contracts/bulletin-index-abi.ts";

const iface = new ethers.Interface(T3rminalBulletinIndexABI);
const INDEX = ("0x" + "cd".repeat(20)) as `0x${string}`;
const REF = {
  shopKey: ("0x" + "ab".repeat(32)) as `0x${string}`,
  merchantId: "merchant-001",
  terminalId: "t3r-abc123",
} as const;

beforeEach(() => {
  reviveCall.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function ok(data: unknown) {
  return { result: { success: true, value: { flags: 0, data } } };
}

function metaResult(cid: string, entryCount: bigint, exists: boolean): Uint8Array {
  return Binary.fromHex(
    iface.encodeFunctionResult("getMetadata", [
      [cid, entryCount, 1_716_700_000n, REF.terminalId, false, exists],
    ]) as `0x${string}`,
  );
}

describe("fetchTerminalReportIndex", () => {
  it("forwards (merchantId, terminalId[, date]) strings to the contract", async () => {
    const seen: Array<{ name: string; args: readonly unknown[] }> = [];
    reviveCall.mockImplementation(async (...callArgs: unknown[]) => {
      const data = Binary.toHex(callArgs[5] as Uint8Array);
      const parsed = iface.parseTransaction({ data })!;
      seen.push({ name: parsed.name, args: parsed.args });
      if (parsed.name === "getAllDates") {
        return ok(
          Binary.fromHex(
            iface.encodeFunctionResult("getAllDates", [["2026-05-25", "2026-05-26"]]) as `0x${string}`,
          ),
        );
      }
      expect(parsed.name).toBe("getMetadata");
      const date = parsed.args[2] as string;
      return ok(metaResult(`bafy-${date}`, 3n, true));
    });

    const index = await fetchTerminalReportIndex(REF, INDEX);

    const datesCall = seen.find((c) => c.name === "getAllDates")!;
    expect(datesCall.args[0]).toBe(REF.merchantId);
    expect(datesCall.args[1]).toBe(REF.terminalId);

    const metaCall = seen.find((c) => c.name === "getMetadata")!;
    expect(metaCall.args[0]).toBe(REF.merchantId);
    expect(metaCall.args[1]).toBe(REF.terminalId);
    expect(typeof metaCall.args[2]).toBe("string");

    expect(index.shopKey).toBe(REF.shopKey);
    expect(index.count).toBe(2);
    expect(index.entries.map((e) => e.date)).toEqual(["2026-05-26", "2026-05-25"]);
    expect(index.entries[0]?.metadata.cid).toBe("bafy-2026-05-26");
  });

  it("returns an empty index when no dates exist", async () => {
    reviveCall.mockResolvedValueOnce(
      ok(Binary.fromHex(iface.encodeFunctionResult("getAllDates", [[]]) as `0x${string}`)),
    );
    expect(await fetchTerminalReportIndex(REF, INDEX)).toEqual({
      shopKey: REF.shopKey,
      count: 0,
      entries: [],
    });
  });

  it("drops dates whose metadata reports exists:false", async () => {
    reviveCall.mockImplementation(async (...callArgs: unknown[]) => {
      const data = Binary.toHex(callArgs[5] as Uint8Array);
      const parsed = iface.parseTransaction({ data })!;
      if (parsed.name === "getAllDates") {
        return ok(
          Binary.fromHex(
            iface.encodeFunctionResult("getAllDates", [["2026-05-25", "2026-05-26"]]) as `0x${string}`,
          ),
        );
      }
      const live = (parsed.args[2] as string) === "2026-05-26";
      return ok(metaResult(live ? "bafy-live" : "", live ? 1n : 0n, live));
    });

    const index = await fetchTerminalReportIndex(REF, INDEX);
    expect(index.count).toBe(1);
    expect(index.entries.map((e) => e.date)).toEqual(["2026-05-26"]);
  });
});
