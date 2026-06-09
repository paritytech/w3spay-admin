import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { Binary } from "polkadot-api";

import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { listMerchantEntries } from "@features/merchant/contracts/list-merchant-entries.ts";
import { envConfig } from "@/config";

const REGISTRY_READ_ORIGIN = envConfig.chain.readOnlyOrigin;

const reviveCall = vi.fn();

vi.mock("@shared/chain/use-client.ts", () => ({
  useMainClient: () => ({
    client: {
      getUnsafeApi: () => ({
        apis: { ReviveApi: { call: reviveCall, address: vi.fn() } },
        query: {
          Revive: { OriginalAccount: { getValue: vi.fn() } },
        },
        tx: {
          Revive: { call: vi.fn(), map_account: vi.fn() },
        },
      }),
    },
    unsafeApi: undefined,
  }),
  resetMainClient: vi.fn(),
}));

const iface = new ethers.Interface(W3SPayRegistryABI);

const REGISTRY = ("0x" + "ab".repeat(20)) as `0x${string}`;

beforeEach(() => {
  reviveCall.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function encodeTerminalKeysResult(value: readonly `0x${string}`[]): Uint8Array {
  return Binary.fromHex(
    iface.encodeFunctionResult("getAllTerminalKeys", [value]) as `0x${string}`,
  );
}

function encodeMerchantByKeyResult(
  value: readonly [
    string,
    string,
    `0x${string}`,
    string,
    number,
    bigint,
    bigint,
    boolean,
  ],
): Uint8Array {
  return Binary.fromHex(
    iface.encodeFunctionResult("getMerchantByKey", [value]) as `0x${string}`,
  );
}

describe("listMerchantEntries", () => {
  it("reads terminal keys, loads entries, and projects rows for the main merchant view", async () => {
    const activeKey = ("0x" + "11".repeat(32)) as `0x${string}`;
    const deletedKey = ("0x" + "22".repeat(32)) as `0x${string}`;
    const destination = ("0x" + "ab".repeat(32)) as `0x${string}`;

    reviveCall
      .mockResolvedValueOnce({
        result: {
          success: true,
          value: { flags: 0, data: encodeTerminalKeysResult([activeKey, deletedKey]) },
        },
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          value: {
            flags: 0,
            data: encodeMerchantByKeyResult([
              "merchant-1",
              "terminal-1",
              destination,
              "Main bar",
              1,
              1_700_000_000n,
              1_700_000_123n,
              true,
            ]),
          },
        },
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          value: {
            flags: 0,
            data: encodeMerchantByKeyResult([
              "",
              "",
              ("0x" + "00".repeat(32)) as `0x${string}`,
              "",
              0,
              0n,
              0n,
              false,
            ]),
          },
        },
      });

    const rows = await listMerchantEntries(REGISTRY);

    expect(rows).toEqual([
      {
        key: activeKey,
        merchantId: "merchant-1",
        terminalId: "terminal-1",
        destinationAccountId: destination,
        displayName: "Main bar",
        status: "paused",
        createdAt: "2023-11-14T22:13:20.000Z",
        updatedAt: "2023-11-14T22:15:23.000Z",
      },
    ]);
    expect(reviveCall).toHaveBeenCalledTimes(3);

    for (const call of reviveCall.mock.calls) {
      expect(call[0]).toBe(REGISTRY_READ_ORIGIN);
    }
  });

  it("rejects unknown contract status values instead of mislabelling merchants", async () => {
    const key = ("0x" + "33".repeat(32)) as `0x${string}`;

    reviveCall
      .mockResolvedValueOnce({
        result: { success: true, value: { flags: 0, data: encodeTerminalKeysResult([key]) } },
      })
      .mockResolvedValueOnce({
        result: {
          success: true,
          value: {
            flags: 0,
            data: encodeMerchantByKeyResult([
              "merchant-1",
              "terminal-1",
              ("0x" + "ab".repeat(32)) as `0x${string}`,
              "Main bar",
              9,
              1n,
              1n,
              true,
            ]),
          },
        },
      });

    await expect(listMerchantEntries(REGISTRY)).rejects.toThrow(/unknown merchant status 9/);
  });
});

describe("setMerchantDestination ABI", () => {
  it("encodes via ethers Interface and round-trips the args", () => {
    const dest = ("0x" + "cd".repeat(32)) as `0x${string}`;
    const data = iface.encodeFunctionData("setMerchantDestination", [
      "funkhaus",
      "bar-east-01",
      dest,
    ]);

    const decoded = iface.decodeFunctionData("setMerchantDestination", data);
    expect(decoded[0]).toBe("funkhaus");
    expect(decoded[1]).toBe("bar-east-01");
    expect((decoded[2] as string).toLowerCase()).toBe(dest);
  });

  it("uses a distinct selector from updateMerchant — the two are not aliases", () => {
    const setSel = iface.getFunction("setMerchantDestination")?.selector;
    const updSel = iface.getFunction("updateMerchant")?.selector;
    expect(setSel).toBeTruthy();
    expect(updSel).toBeTruthy();
    expect(setSel).not.toBe(updSel);
  });
});

describe("removeMerchant ABI", () => {
  it("encodes via ethers Interface and round-trips the (merchantId, terminalId) args", () => {
    const data = iface.encodeFunctionData("removeMerchant", ["funkhaus", "bar-east-01"]);
    const decoded = iface.decodeFunctionData("removeMerchant", data);
    expect(decoded[0]).toBe("funkhaus");
    expect(decoded[1]).toBe("bar-east-01");
  });

  it("uses a distinct selector from setMerchantStatus — delete is not a status flip", () => {
    const removeSel = iface.getFunction("removeMerchant")?.selector;
    const statusSel = iface.getFunction("setMerchantStatus")?.selector;
    expect(removeSel).toBeTruthy();
    expect(statusSel).toBeTruthy();
    expect(removeSel).not.toBe(statusSel);
  });
});
