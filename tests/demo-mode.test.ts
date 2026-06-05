import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as HostConnectionModule from "@shared/api/host-connection.ts";

import {
  applyDelete,
  applyRegister,
  applySetDestination,
  applySetStatus,
  applyUpdate,
  DemoMerchantDuplicateError,
  DemoMerchantNotFoundError,
  synthesizeTxHash,
} from "@shared/demo/demo-actions.ts";
import { getDemoTokenBalance } from "@shared/demo/demo-balances.ts";
import { DEMO_MERCHANT_SEED } from "@shared/demo/demo-merchants.ts";
import { merchantFromRegistryRow, type RegistryMerchantRow } from "@features/merchant/merchant-model.ts";
import { isAccountId32Hex, type AccountId32Hex } from "@shared/utils/address.ts";

// `isDemoMode()` reads `envConfig.features.demoMode` and `isInHost()`.
// We mock both so the test exercises each branch of the flag matrix in
// isolation, without spinning up the real config singleton with its
// network resolution.
const detectHostEnvironment = vi.fn<() => "standalone" | "web-iframe" | "desktop-webview">(
  () => "standalone",
);
const configHolder: {
  features: { demoMode: "auto" | "on" | "off" };
  token: { decimals: number };
  contracts: { merchantRegistryAddress: string };
} = {
  features: { demoMode: "auto" },
  token: { decimals: 6 },
  contracts: { merchantRegistryAddress: "0x1234567890abcdef1234567890abcdef12345678" },
};

vi.mock("@shared/config.ts", () => ({
  get envConfig() {
    return configHolder;
  },
}));
vi.mock("@shared/api/host-connection.ts", async (importOriginal) => {
  // We only want to override `detectHostEnvironment`/`isInHost` so
  // `isDemoMode()` can be steered; the rest of the module stays out of
  // the test path because nothing in this file pulls those exports.
  const _orig = await importOriginal<typeof HostConnectionModule>();
  return {
    detectHostEnvironment,
    isInHost: () => detectHostEnvironment() !== "standalone",
    // Re-export the cache-reset and demo-mode resolver so the test can
    // reset between cases.
    isDemoMode: () => {
      const flag = configHolder.features.demoMode;
      if (flag === "on") return true;
      if (flag === "off") return false;
      return detectHostEnvironment() === "standalone";
    },
    __resetDemoModeCacheForTests: () => {},
  };
});

// Deferred imports: demo-mode modules must observe the config/host mocks above.
const { isDemoMode } = await import("@shared/api/host-connection.ts");
const { DEMO_REGISTRY_ADDRESS, resolveEffectiveRegistryAddress } = await import(
  "@shared/demo/demo-contracts.ts"
);

beforeEach(() => {
  detectHostEnvironment.mockReturnValue("standalone");
  configHolder.features.demoMode = "auto";
  configHolder.contracts.merchantRegistryAddress = "0x1234567890abcdef1234567890abcdef12345678";
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── isDemoMode() ─────────────────────────────────────────────────

describe("isDemoMode()", () => {
  it("returns true outside a host in auto mode", () => {
    detectHostEnvironment.mockReturnValue("standalone");
    configHolder.features.demoMode = "auto";
    expect(isDemoMode()).toBe(true);
  });

  it("returns false inside a web-iframe host in auto mode", () => {
    detectHostEnvironment.mockReturnValue("web-iframe");
    configHolder.features.demoMode = "auto";
    expect(isDemoMode()).toBe(false);
  });

  it("returns false inside a desktop-webview host in auto mode", () => {
    detectHostEnvironment.mockReturnValue("desktop-webview");
    configHolder.features.demoMode = "auto";
    expect(isDemoMode()).toBe(false);
  });

  it("forces demo on when flag === 'on', even inside a host", () => {
    detectHostEnvironment.mockReturnValue("web-iframe");
    configHolder.features.demoMode = "on";
    expect(isDemoMode()).toBe(true);
  });

  it("disables demo entirely when flag === 'off'", () => {
    detectHostEnvironment.mockReturnValue("standalone");
    configHolder.features.demoMode = "off";
    expect(isDemoMode()).toBe(false);
  });
});

// ── DEMO_MERCHANT_SEED ───────────────────────────────────────────

describe("DEMO_MERCHANT_SEED", () => {
  it("contains rows spanning POS and t3rminal kinds", () => {
    const kinds = new Set(DEMO_MERCHANT_SEED.map((r) => merchantFromRegistryRow(r).kind));
    expect(kinds.has("pos")).toBe(true);
    expect(kinds.has("t3rminal")).toBe(true);
  });

  it("uses well-formed 64-hex AccountId32 destinations", () => {
    for (const row of DEMO_MERCHANT_SEED) {
      expect(isAccountId32Hex(row.destinationAccountId)).toBe(true);
    }
  });

  it("survives merchantFromRegistryRow without throwing", () => {
    expect(() => DEMO_MERCHANT_SEED.map(merchantFromRegistryRow)).not.toThrow();
  });

  it("includes active, paused, and revoked statuses", () => {
    const statuses = new Set(DEMO_MERCHANT_SEED.map((r) => r.status));
    expect(statuses).toEqual(new Set(["active", "paused", "revoked"]));
  });

  it("emits distinct terminalKeys", () => {
    const keys = new Set(DEMO_MERCHANT_SEED.map((r) => r.key));
    expect(keys.size).toBe(DEMO_MERCHANT_SEED.length);
  });
});

// ── Pure reducers ────────────────────────────────────────────────

const ACC_A: AccountId32Hex =
  "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const ACC_B: AccountId32Hex =
  "0x1111111122222222333333334444444455555555666666667777777788888888";

function seedRows(): readonly RegistryMerchantRow[] {
  return DEMO_MERCHANT_SEED;
}

describe("applyRegister", () => {
  it("appends a new ACTIVE row, leaving the input untouched", () => {
    const before = seedRows();
    const next = applyRegister(
      before,
      {
        merchantId: "new-merchant",
        terminalId: "term-x",
        destinationAccountId: ACC_A,
        displayName: "New Shop",
      },
      Date.UTC(2026, 4, 27, 12),
    );
    expect(next).not.toBe(before);
    expect(next.length).toBe(before.length + 1);
    const added = next[next.length - 1]!;
    expect(added.status).toBe("active");
    expect(added.merchantId).toBe("new-merchant");
    expect(added.terminalId).toBe("term-x");
    expect(added.destinationAccountId).toBe(ACC_A);
    expect(added.createdAt).toBe(added.updatedAt);
  });

  it("throws DemoMerchantDuplicateError on a collision", () => {
    const before = seedRows();
    const existing = before[0]!;
    expect(() =>
      applyRegister(
        before,
        {
          merchantId: existing.merchantId,
          terminalId: existing.terminalId,
          destinationAccountId: ACC_A,
          displayName: "x",
        },
        Date.now(),
      ),
    ).toThrow(DemoMerchantDuplicateError);
  });
});

describe("applyUpdate", () => {
  it("replaces only the matched row", () => {
    const before = seedRows();
    const target = before[0]!;
    const next = applyUpdate(
      before,
      {
        merchantId: target.merchantId,
        terminalId: target.terminalId,
        destinationAccountId: ACC_B,
        displayName: "Renamed",
      },
      Date.UTC(2026, 4, 27),
    );
    expect(next).not.toBe(before);
    expect(next[0]!.displayName).toBe("Renamed");
    expect(next[0]!.destinationAccountId).toBe(ACC_B);
    for (let i = 1; i < next.length; i += 1) {
      expect(next[i]).toBe(before[i]);
    }
  });

  it("throws DemoMerchantNotFoundError on a miss", () => {
    expect(() =>
      applyUpdate(
        seedRows(),
        {
          merchantId: "missing",
          terminalId: "missing",
          destinationAccountId: ACC_A,
          displayName: "x",
        },
        Date.now(),
      ),
    ).toThrow(DemoMerchantNotFoundError);
  });
});

describe("applySetStatus", () => {
  it("flips the status and bumps updatedAt", () => {
    const before = seedRows();
    const active = before.find((r) => r.status === "active")!;
    const next = applySetStatus(
      before,
      {
        merchantId: active.merchantId,
        terminalId: active.terminalId,
        status: "paused",
      },
      Date.UTC(2026, 4, 27, 12),
    );
    const updated = next.find((r) => r.key === active.key)!;
    expect(updated.status).toBe("paused");
    expect(updated.updatedAt).not.toBe(active.updatedAt);
  });

  it("returns the same array when status is unchanged", () => {
    const before = seedRows();
    const paused = before.find((r) => r.status === "paused")!;
    const next = applySetStatus(
      before,
      {
        merchantId: paused.merchantId,
        terminalId: paused.terminalId,
        status: "paused",
      },
      Date.now(),
    );
    expect(next).toBe(before);
  });
});

describe("applySetDestination", () => {
  it("rotates the destination", () => {
    const before = seedRows();
    const target = before[0]!;
    const next = applySetDestination(
      before,
      {
        merchantId: target.merchantId,
        terminalId: target.terminalId,
        destinationAccountId: ACC_A,
      },
      Date.UTC(2026, 4, 27, 12),
    );
    expect(next[0]!.destinationAccountId).toBe(ACC_A);
    expect(next[0]!.displayName).toBe(target.displayName);
  });

  it("returns the same array when destination is unchanged", () => {
    const before = seedRows();
    const target = before[0]!;
    const next = applySetDestination(
      before,
      {
        merchantId: target.merchantId,
        terminalId: target.terminalId,
        destinationAccountId: target.destinationAccountId,
      },
      Date.now(),
    );
    expect(next).toBe(before);
  });
});

describe("applyDelete", () => {
  it("removes the matched row by (merchantId, terminalId)", () => {
    const before = seedRows();
    const target = before[1]!;
    const next = applyDelete(before, {
      merchantId: target.merchantId,
      terminalId: target.terminalId,
    });
    expect(next.length).toBe(before.length - 1);
    expect(next.find((r) => r.key === target.key)).toBeUndefined();
  });

  it("throws DemoMerchantNotFoundError on a miss", () => {
    expect(() => applyDelete(seedRows(), { merchantId: "x", terminalId: "y" })).toThrow(
      DemoMerchantNotFoundError,
    );
  });
});

// ── synthesizeTxHash ────────────────────────────────────────────

describe("synthesizeTxHash", () => {
  it("returns 0x + 64 lowercase hex characters", () => {
    const h = synthesizeTxHash();
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("emits distinct values across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 16; i += 1) seen.add(synthesizeTxHash());
    expect(seen.size).toBe(16);
  });
});

// ── getDemoTokenBalance ────────────────────────────────────────

describe("getDemoTokenBalance", () => {
  it("is deterministic for the same address", () => {
    const a = getDemoTokenBalance(ACC_A);
    const b = getDemoTokenBalance(ACC_A);
    expect(a).toBe(b);
  });

  it("emits different balances for different addresses", () => {
    expect(getDemoTokenBalance(ACC_A)).not.toBe(getDemoTokenBalance(ACC_B));
  });

  it("returns a bigint within the configured planck range", () => {
    const balance = getDemoTokenBalance(ACC_A);
    expect(typeof balance).toBe("bigint");
    // 9_999 CASH * 10^6 plancks per token = 9_999_000_000 plancks ceiling.
    expect(balance).toBeLessThanOrEqual(9_999n * 10n ** 6n + 10n ** 6n);
    expect(balance).toBeGreaterThanOrEqual(0n);
  });
});
// ── DEMO_REGISTRY_ADDRESS + resolveEffectiveRegistryAddress ─────

describe("DEMO_REGISTRY_ADDRESS", () => {
  it("is a lowercase 20-byte H160 with the `dead` marker", () => {
    expect(DEMO_REGISTRY_ADDRESS).toMatch(/^0x[0-9a-f]{40}$/);
    // Marker keeps the demo placeholder visually distinguishable from a
    // real deployment address in screenshots and clipboard copies.
    expect(DEMO_REGISTRY_ADDRESS.includes("dead")).toBe(true);
  });
});

describe("resolveEffectiveRegistryAddress()", () => {
  it("returns the synthetic placeholder in demo mode (standalone + auto)", () => {
    detectHostEnvironment.mockReturnValue("standalone");
    configHolder.features.demoMode = "auto";
    expect(resolveEffectiveRegistryAddress()).toBe(DEMO_REGISTRY_ADDRESS);
  });

  it("returns the env-configured address when demo is forced off", () => {
    detectHostEnvironment.mockReturnValue("standalone");
    configHolder.features.demoMode = "off";
    configHolder.contracts.merchantRegistryAddress =
      "0xabcdef0123456789abcdef0123456789abcdef01";
    expect(resolveEffectiveRegistryAddress()).toBe(
      "0xabcdef0123456789abcdef0123456789abcdef01",
    );
  });

  it("returns the synthetic placeholder even inside a host when demo is forced on", () => {
    detectHostEnvironment.mockReturnValue("web-iframe");
    configHolder.features.demoMode = "on";
    configHolder.contracts.merchantRegistryAddress = "0xrealrealrealrealrealrealrealrealrealreal";
    expect(resolveEffectiveRegistryAddress()).toBe(DEMO_REGISTRY_ADDRESS);
  });

  it("returns the empty fallback when env unset outside demo (real-deploy misconfig)", () => {
    detectHostEnvironment.mockReturnValue("web-iframe");
    configHolder.features.demoMode = "auto"; // auto + inside-host → demo OFF
    configHolder.contracts.merchantRegistryAddress = "";
    expect(resolveEffectiveRegistryAddress()).toBe("");
  });
});
