import { afterEach, describe, expect, it } from "vitest";

import { requireRegistryAddress } from "../contracts/scripts/lib/revive.ts";

const ENV_KEYS = ["VITE_W3SPAY_REGISTRY_ADDRESS", "W3SPAY_REGISTRY_ADDRESS"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = originalEnv[key];
    if (original == null) delete process.env[key];
    else process.env[key] = original;
  }
});

describe("requireRegistryAddress", () => {
  it("prefers the script-specific registry override over a stale Vite address", () => {
    process.env.VITE_W3SPAY_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.W3SPAY_REGISTRY_ADDRESS = "0x2222222222222222222222222222222222222222";

    expect(requireRegistryAddress()).toBe("0x2222222222222222222222222222222222222222");
  });

  it("falls back to the Vite registry address", () => {
    process.env.VITE_W3SPAY_REGISTRY_ADDRESS = "0x1111111111111111111111111111111111111111";
    delete process.env.W3SPAY_REGISTRY_ADDRESS;

    expect(requireRegistryAddress()).toBe("0x1111111111111111111111111111111111111111");
  });
});
