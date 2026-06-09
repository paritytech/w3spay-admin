/**
 * Processor Z-report viewing: the on-chain index read, the tolerant doc
 * parser, the fetch→decrypt→parse loader (the cross-app compatibility proof —
 * both envelope modules are byte-identical by design), and amount formatting
 * from the doc's own token metadata.
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

import { W3SPayRegistryABI } from "@shared/chain/registry-abi.ts";
import { listProcessorReports } from "@features/reports/contracts/processor-report-read.ts";
import { loadProcessorReport } from "@features/reports/contracts/processor-report-queries.ts";
import {
  formatReportAmount,
  parseProcessorReportDoc,
  processorReportToCsv,
  type ProcessorReportDoc,
} from "@features/reports/processor-report.ts";
import { encryptCredentialEnvelope } from "@shared/utils/wire/credential-envelope.ts";

const iface = new ethers.Interface(W3SPayRegistryABI);
const REGISTRY = ("0x" + "ab".repeat(20)) as `0x${string}`;

beforeEach(() => {
  reviveCall.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function ok(data: unknown) {
  return { result: { success: true, value: { flags: 0, data } } };
}

describe("listProcessorReports", () => {
  it("maps seqs to entries, converts committedAt to ISO, filters exists:false, sorts newest-first", async () => {
    const records = new Map<bigint, readonly [bigint, string, number, bigint, boolean]>([
      [1n, [1n, "bafk-one", 100, 1_700_000_000n, true]],
      [2n, [2n, "", 0, 0n, false]], // deleted/never-written slot
      [3n, [3n, "bafk-three", 321, 1_700_000_123n, true]],
    ]);
    // Dispatch on calldata, not call order — the per-seq reads run concurrently.
    reviveCall.mockImplementation(async (...callArgs: unknown[]) => {
      const data = Binary.toHex(callArgs[5] as Uint8Array);
      const parsed = iface.parseTransaction({ data })!;
      if (parsed.name === "getProcessorReportSeqs") {
        expect(parsed.args[0]).toBe("group-1");
        return ok(
          Binary.fromHex(
            iface.encodeFunctionResult("getProcessorReportSeqs", [[1n, 2n, 3n]]) as `0x${string}`,
          ),
        );
      }
      expect(parsed.name).toBe("getProcessorReport");
      const record = records.get(parsed.args[1] as bigint)!;
      return ok(
        Binary.fromHex(
          iface.encodeFunctionResult("getProcessorReport", [record]) as `0x${string}`,
        ),
      );
    });

    const entries = await listProcessorReports("group-1", REGISTRY);
    expect(entries.map((e) => e.seq)).toEqual([3, 1]);
    expect(entries[1]).toEqual({
      seq: 1,
      cid: "bafk-one",
      size: 100,
      committedAt: new Date(1_700_000_000 * 1_000).toISOString(),
    });
  });

  it("returns [] for a group with no published reports", async () => {
    reviveCall.mockResolvedValueOnce(
      ok(
        Binary.fromHex(
          iface.encodeFunctionResult("getProcessorReportSeqs", [[]]) as `0x${string}`,
        ),
      ),
    );
    expect(await listProcessorReports("group-1", REGISTRY)).toEqual([]);
  });
});

const DOC: ProcessorReportDoc = {
  format: "w3s-processor-report",
  version: 1,
  kind: "z",
  groupId: "group-1",
  token: { symbol: "CASH", decimals: 6 },
  generatedAtMs: 123,
  seq: 7,
  fromBlock: 1,
  toBlock: 100,
  lines: [{ terminalId: "t1", payoutHex: `0x${"a".repeat(64)}`, totalPlanck: "3000", count: 2 }],
  grandTotalPlanck: "3000",
  count: 2,
  payments: [
    { paymentId: "p1", terminalId: "t1", amountPlanck: "1000", blockNumber: 5, observedAtMs: 50 },
    {
      paymentId: "p2",
      terminalId: "t1",
      amountPlanck: "2000",
      blockNumber: 9,
      observedAtMs: 90,
      fromHex: `0x${"b".repeat(64)}`,
    },
  ],
};

describe("parseProcessorReportDoc", () => {
  it("round-trips a valid doc", () => {
    expect(parseProcessorReportDoc(JSON.parse(JSON.stringify(DOC)), "group-1")).toEqual(DOC);
  });

  it.each([
    ["format", { ...DOC, format: "something-else" }],
    ["version", { ...DOC, version: 2 }],
    ["kind", { ...DOC, kind: "y" }],
    ["missing lines", { ...DOC, lines: undefined }],
    ["malformed line", { ...DOC, lines: [{ terminalId: 5 }] }],
    ["grand total type", { ...DOC, grandTotalPlanck: 3000 }],
    ["token shape", { ...DOC, token: { symbol: "CASH" } }],
  ])("rejects a doc with bad %s", (_label, raw) => {
    expect(parseProcessorReportDoc(raw, "group-1")).toBeNull();
  });

  it("rejects a doc for a different group", () => {
    expect(parseProcessorReportDoc(DOC, "another-group")).toBeNull();
  });

  it("tolerates missing payments (legacy) as an empty list and drops malformed entries", () => {
    const { payments: _omitted, ...withoutPayments } = DOC;
    expect(parseProcessorReportDoc(withoutPayments, "group-1")?.payments).toEqual([]);

    const mixed = { ...DOC, payments: [DOC.payments[0], { paymentId: 42 }, "junk"] };
    expect(parseProcessorReportDoc(mixed, "group-1")?.payments).toEqual([DOC.payments[0]]);
  });

  it("keeps coin payments that carry no block number, dropping only a wrong-typed one", () => {
    const coin = { paymentId: "c-1", terminalId: "tap-1", amountPlanck: "500", observedAtMs: 7 };
    const doc = { ...DOC, payments: [coin, { ...coin, paymentId: "c-2", blockNumber: "120" }] };
    const parsed = parseProcessorReportDoc(doc, "group-1");
    expect(parsed?.payments).toEqual([coin]);
    expect(parsed != null && "blockNumber" in parsed.payments[0]!).toBe(false);
  });

  it("omits the seq key for X docs that carry none", () => {
    const { seq: _omitted, ...xDoc } = { ...DOC, kind: "x" as const };
    const parsed = parseProcessorReportDoc(xDoc, "group-1");
    expect(parsed?.kind).toBe("x");
    expect(parsed != null && "seq" in parsed).toBe(false);
  });
});

describe("loadProcessorReport", () => {
  const GATEWAY = "https://gateway.example";

  async function envelopeJsonFor(doc: ProcessorReportDoc, passkey: string): Promise<string> {
    const envelope = await encryptCredentialEnvelope(
      new TextEncoder().encode(JSON.stringify(doc)),
      passkey,
    );
    return JSON.stringify(envelope);
  }

  it("fetches, decrypts, and parses a published doc with the group passkey", async () => {
    const body = await envelopeJsonFor(DOC, "pass-1");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${GATEWAY}/ipfs/bafk-cid`);
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await loadProcessorReport({
      groupId: "group-1",
      cid: "bafk-cid",
      passkey: "pass-1",
      gatewayBase: GATEWAY,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "ready", doc: DOC });
  });

  it("maps a wrong passkey to decrypt-error", async () => {
    const body = await envelopeJsonFor(DOC, "pass-1");
    const fetchImpl = (async () => new Response(body, { status: 200 })) as typeof fetch;

    const result = await loadProcessorReport({
      groupId: "group-1",
      cid: "bafk-cid",
      passkey: "wrong",
      gatewayBase: GATEWAY,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "decrypt-error" });
  });

  it("maps an HTTP error to fetch-error", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const result = await loadProcessorReport({
      groupId: "group-1",
      cid: "bafk-cid",
      passkey: "pass-1",
      gatewayBase: GATEWAY,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "fetch-error", reason: "Gateway returned HTTP 500." });
  });

  it("maps a decrypted payload of the wrong shape to invalid", async () => {
    const envelope = await encryptCredentialEnvelope(
      new TextEncoder().encode(JSON.stringify({ hello: "world" })),
      "pass-1",
    );
    const body = JSON.stringify(envelope);
    const fetchImpl = (async () => new Response(body, { status: 200 })) as typeof fetch;
    const result = await loadProcessorReport({
      groupId: "group-1",
      cid: "bafk-cid",
      passkey: "pass-1",
      gatewayBase: GATEWAY,
      fetchImpl,
    });
    expect(result).toEqual({ kind: "invalid", reason: "unrecognized report format" });
  });
});

describe("formatReportAmount", () => {
  it("splits on the doc's token decimals, trims to ≥2 fraction places, appends the symbol", () => {
    expect(formatReportAmount("1234500", { symbol: "CASH", decimals: 6 })).toBe("1.2345 CASH");
    expect(formatReportAmount("1000000", { symbol: "CASH", decimals: 6 })).toBe("1.00 CASH");
    expect(formatReportAmount("50", { symbol: "TOK", decimals: 2 })).toBe("0.50 TOK");
  });

  it("returns the raw string when the amount is not a valid integer", () => {
    expect(formatReportAmount("not-a-number", { symbol: "CASH", decimals: 6 })).toBe("not-a-number");
  });
});

describe("processorReportToCsv", () => {
  it("emits the processor-compatible header and one row per payment", () => {
    const csv = processorReportToCsv(DOC);
    const [header, ...rows] = csv.split("\n");
    expect(header).toBe("payment_id,terminal_id,amount,token,amount_planck,block_number,observed_at,payer");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(`p1,t1,0.001,CASH,1000,5,${new Date(50).toISOString()},`);
    expect(rows[1]!.endsWith(`,0x${"b".repeat(64)}`)).toBe(true);
  });

  it("leaves the block cell empty for coin payments", () => {
    const doc: ProcessorReportDoc = {
      ...DOC,
      payments: [{ paymentId: "c-1", terminalId: "tap-1", amountPlanck: "500000", observedAtMs: 9 }],
    };
    expect(processorReportToCsv(doc).split("\n")[1]).toBe(
      `c-1,tap-1,0.5,CASH,500000,,${new Date(9).toISOString()},`,
    );
  });
});
