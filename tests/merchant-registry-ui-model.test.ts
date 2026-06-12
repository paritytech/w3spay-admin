import { describe, expect, it } from "vitest";

import {
  buildRegisterMerchant,
  computeTerminalKey,
  defaultT3rminalDisplayName,
  merchantFromRegistryRow,
  merchantKindFromTerminalId,
  shortTerminalId,
  T3RMINAL_TERMINAL_ID_PREFIX,
  t3rminalTerminalIdForDestination,
  type MerchantForm,
  type RegistryMerchantRow,
} from "@features/merchant/merchant-model.ts";

const ACCOUNT_ID32 = "0x0102030405060708090a0b0c0d0e0f1011121314151617181920212223242526" as const;
const H160 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const LEFT_PADDED = "0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;

function row(overrides: Partial<RegistryMerchantRow> = {}): RegistryMerchantRow {
  return {
    key: "0xkey",
    merchantId: "funkhaus",
    terminalId: "bar-east-01",
    destinationAccountId: ACCOUNT_ID32,
    displayName: "Bar East",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("merchantFromRegistryRow", () => {
  it("maps every field from the contract row", () => {
    const m = merchantFromRegistryRow(row());
    expect(m.merchantId).toBe("funkhaus");
    expect(m.terminalId).toBe("bar-east-01");
    expect(m.name).toBe("Bar East");
    expect(m.displayName).toBe("Bar East");
    expect(m.status).toBe("active");
    expect(m.destinationAccountId).toBe(ACCOUNT_ID32);
    expect(m.destinationSs58).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(m.derivedH160).toBeNull();
    expect(m.kind).toBe("pos");
    expect(m.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(m.updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("falls back to terminalId when displayName is empty", () => {
    const m = merchantFromRegistryRow(row({ displayName: "" }));
    expect(m.name).toBe("bar-east-01");
    expect(m.displayName).toBe("");
  });

  it("derives H160 when the destination uses the left-padded convention", () => {
    const m = merchantFromRegistryRow(row({ destinationAccountId: LEFT_PADDED }));
    expect(m.derivedH160).toBe(H160);
  });

  it("preserves lifecycle status across the mapping", () => {
    expect(merchantFromRegistryRow(row({ status: "paused" })).status).toBe("paused");
    expect(merchantFromRegistryRow(row({ status: "revoked" })).status).toBe("revoked");
  });

  it("classifies rows with the T3RMINAL_TERMINAL_ID_PREFIX as t3rminal", () => {
    const terminalId = t3rminalTerminalIdForDestination(ACCOUNT_ID32);
    const m = merchantFromRegistryRow(row({ terminalId, displayName: "" }));
    expect(m.kind).toBe("t3rminal");
    expect(m.terminalId.startsWith(T3RMINAL_TERMINAL_ID_PREFIX)).toBe(true);
  });
});

describe("t3rminalTerminalIdForDestination", () => {
  it("uses the configured prefix + lowercase 64-char accountId32 hex tail", () => {
    const id = t3rminalTerminalIdForDestination(ACCOUNT_ID32);
    expect(id).toBe(`${T3RMINAL_TERMINAL_ID_PREFIX}${ACCOUNT_ID32.slice(2)}`);
    expect(merchantKindFromTerminalId(id)).toBe("t3rminal");
  });
});

describe("merchantKindFromTerminalId", () => {
  it("returns 'pos' for free-form terminalIds", () => {
    expect(merchantKindFromTerminalId("bar-east-01")).toBe("pos");
    expect(merchantKindFromTerminalId("")).toBe("pos");
  });

  it("returns 't3rminal' only when the prefix is present", () => {
    expect(merchantKindFromTerminalId(`${T3RMINAL_TERMINAL_ID_PREFIX}abc`)).toBe("t3rminal");
  });
});

describe("defaultT3rminalDisplayName", () => {
  it("renders an editorial fallback label using a short address", () => {
    expect(defaultT3rminalDisplayName(ACCOUNT_ID32)).toMatch(/^T3rminal · /);
  });
});

describe("computeTerminalKey", () => {
  // Pinned against the contract fixture `W3SPayRegistry.test.ts::expectedKey` —
  // drift on either side breaks this case first.
  it("matches the contract's keccak256(merchantId || '|' || terminalId) for the canonical pair", () => {
    expect(computeTerminalKey("funkhaus", "bar-east-01")).toBe(
      "0x5df43d2722e7dd96d7488971eebc714e7e4fa4173273412f2e9f5902a8d80e7e",
    );
  });

  it("always returns lowercase 32-byte hex so it compares cleanly with on-chain keys", () => {
    const key = computeTerminalKey("Funkhaus", "bar-East-01");
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("uses the '|' separator — distinct inputs must produce distinct keys", () => {
    const a = computeTerminalKey("ab", "cd");
    const b = computeTerminalKey("a", "bcd");
    expect(a).not.toBe(b);
  });
});

describe("shortTerminalId", () => {
  const FULL_HEX = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2";
  const FULL_ID = `${T3RMINAL_TERMINAL_ID_PREFIX}${FULL_HEX}`;

  it("truncates a full 64-char T3rminal id to prefix + 5 head chars + ellipsis + 4 tail chars", () => {
    expect(shortTerminalId(FULL_ID)).toBe(`t3r-a1b2c…a1b2`);
  });

  it("leaves the prefix intact so the row is recognisable as a T3rminal entry", () => {
    expect(shortTerminalId(FULL_ID)).toMatch(/^t3r-/);
  });

  it("does not truncate ids already short enough to display whole", () => {
    const short = `${T3RMINAL_TERMINAL_ID_PREFIX}abc`;
    expect(shortTerminalId(short)).toBe(short);
  });

  it("falls back to shortAddr truncation for non-t3r- ids (POS terminals)", () => {
    const pos = "funkhaus-bar-east-01-some-extra-long-identifier";
    expect(shortTerminalId(pos)).toBe(`funkhaus\u2026tifier`);
  });
});

describe("buildRegisterMerchant", () => {
  const form = (overrides: Partial<MerchantForm> = {}): MerchantForm => ({
    terminalId: "bar-east-01",
    merchantId: "funkhaus",
    displayName: "Bar East",
    destination: ACCOUNT_ID32,
    ...overrides,
  });

  it("builds a pos payload with trimmed fields and the derived terminal key", () => {
    const input = buildRegisterMerchant(
      form({ merchantId: " funkhaus ", terminalId: " bar-east-01 " }),
      [],
      "pos",
    );
    expect(input).toMatchObject({
      ok: true,
      payload: {
        merchantId: "funkhaus",
        terminalId: "bar-east-01",
        destinationAccountId: ACCOUNT_ID32,
        displayName: "Bar East",
      },
      terminalKey: computeTerminalKey("funkhaus", "bar-east-01"),
    });
  });

  it("derives the t3rminal terminalId and default display name from the destination", () => {
    const input = buildRegisterMerchant(form({ terminalId: "", displayName: "" }), [], "t3rminal");
    expect(input).toMatchObject({
      ok: true,
      payload: {
        terminalId: t3rminalTerminalIdForDestination(ACCOUNT_ID32),
        displayName: defaultT3rminalDisplayName(ACCOUNT_ID32),
      },
    });
  });

  it("normalizes an SS58 destination to AccountId32 hex", () => {
    const ss58 = merchantFromRegistryRow(row()).destinationSs58;
    const input = buildRegisterMerchant(form({ destination: ss58 }), [], "pos");
    expect(input.ok && input.payload.destinationAccountId).toBe(ACCOUNT_ID32);
  });

  it("rejects a duplicate (merchantId, terminalId) pair on the terminalId field for pos", () => {
    const existing = [merchantFromRegistryRow(row())];
    const input = buildRegisterMerchant(form(), existing, "pos");
    expect(input.ok).toBe(false);
    expect(!input.ok && input.errors.terminalId).toMatch(/already registered/);
  });

  it("rejects a duplicate t3rminal destination on the destination field", () => {
    const terminalId = t3rminalTerminalIdForDestination(ACCOUNT_ID32);
    const existing = [merchantFromRegistryRow(row({ terminalId }))];
    const input = buildRegisterMerchant(form(), existing, "t3rminal");
    expect(input.ok).toBe(false);
    expect(!input.ok && input.errors.destination).toMatch(/already registered/);
  });

  it("allows the same terminalId under a different merchant", () => {
    const existing = [merchantFromRegistryRow(row({ merchantId: "other" }))];
    expect(buildRegisterMerchant(form(), existing, "pos").ok).toBe(true);
  });

  it("rejects an unparseable destination", () => {
    const input = buildRegisterMerchant(form({ destination: "not-an-address" }), [], "pos");
    expect(input.ok).toBe(false);
    expect(!input.ok && input.errors.destination).toBeTruthy();
  });

  it("accumulates field errors for blank merchantId and terminalId", () => {
    const input = buildRegisterMerchant(
      form({ merchantId: "", terminalId: "  " }),
      [],
      "pos",
    );
    expect(input.ok).toBe(false);
    expect(!input.ok && input.errors).toMatchObject({
      merchantId: "Required.",
      terminalId: "Required.",
    });
  });
});
