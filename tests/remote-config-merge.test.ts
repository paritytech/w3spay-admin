import { describe, expect, it } from "vitest";

import {
  buildMergedRemoteConfigExport,
  buildRemoteConfigExport,
  RemoteConfigConflictError,
} from "@features/payment-processors/remote-config-export.ts";
import { generateTerminalSecret } from "@features/payment-processors/secret-generation.ts";
import type {
  ProcessorConfigForm,
  ProcessorTerminalForm,
} from "@features/payment-processors/payment-processor-model.ts";

const PAYOUT = `0x${"11".repeat(32)}`;

async function terminal(terminalId: string, label = ""): Promise<ProcessorTerminalForm> {
  const secret = await generateTerminalSecret();
  return { terminalId, label, payoutAddress: PAYOUT, topicId: secret.topicId, pemFile: secret.pemFile };
}

function form(groupId: string, terminals: ProcessorTerminalForm[]): ProcessorConfigForm {
  return { groupId, merchantName: `${groupId} merchant`, merchantId: groupId, passkey: "pk", terminals };
}

describe("buildMergedRemoteConfigExport", () => {
  it("map-joins disjoint configs, preserving each per-form entry verbatim", async () => {
    const a = form("funkhaus-zola", [await terminal("1111", "Bar 1"), await terminal("2222")]);
    const b = form("cafe-luna", [await terminal("3333", "Till")]);

    const merged = buildMergedRemoteConfigExport([a, b]);

    expect(Object.keys(merged).sort()).toEqual(["1111", "2222", "3333"]);
    expect(merged).toEqual({ ...buildRemoteConfigExport(a), ...buildRemoteConfigExport(b) });
    expect(merged["2222"]!.name).toBe("funkhaus-zola merchant");
    expect(merged["3333"]!.name).toBe("Till");
  });

  it("matches the single-config export for one form and is empty for none", async () => {
    const a = form("funkhaus-zola", [await terminal("1111")]);
    expect(buildMergedRemoteConfigExport([a])).toEqual(buildRemoteConfigExport(a));
    expect(buildMergedRemoteConfigExport([])).toEqual({});
  });

  it("throws RemoteConfigConflictError when two configs map the same terminalId", async () => {
    const a = form("funkhaus-zola", [await terminal("1111")]);
    const b = form("cafe-luna", [await terminal("1111")]);

    let caught: unknown;
    try {
      buildMergedRemoteConfigExport([a, b]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RemoteConfigConflictError);
    const err = caught as RemoteConfigConflictError;
    expect(err.conflicts).toEqual([{ terminalId: "1111", groupIds: ["funkhaus-zola", "cafe-luna"] }]);
    expect(err.message).toContain("1111");
    expect(err.message).toContain("funkhaus-zola");
    expect(err.message).toContain("cafe-luna");
    expect(err.message).toContain("Remove the terminal from all but one config");
  });

  it("collects every conflict before throwing", async () => {
    const a = form("g-one", [await terminal("1111"), await terminal("2222")]);
    const b = form("g-two", [await terminal("1111"), await terminal("2222"), await terminal("3333")]);

    let caught: unknown;
    try {
      buildMergedRemoteConfigExport([a, b]);
    } catch (e) {
      caught = e;
    }
    const err = caught as RemoteConfigConflictError;
    expect(err.conflicts.map((c) => c.terminalId).sort()).toEqual(["1111", "2222"]);
  });

  it("trims terminalIds before joining, matching the single-export key normalization", async () => {
    const a = form("g-one", [await terminal(" 1111 ")]);
    const b = form("g-two", [await terminal("1111")]);
    expect(() => buildMergedRemoteConfigExport([a, b])).toThrow(RemoteConfigConflictError);
  });

  it("flags a terminalId duplicated inside a single config", async () => {
    const a = form("g-one", [await terminal("1111"), await terminal("1111")]);

    let caught: unknown;
    try {
      buildMergedRemoteConfigExport([a]);
    } catch (e) {
      caught = e;
    }
    const err = caught as RemoteConfigConflictError;
    expect(err).toBeInstanceOf(RemoteConfigConflictError);
    expect(err.conflicts).toEqual([{ terminalId: "1111", groupIds: ["g-one", "g-one"] }]);
  });
});
