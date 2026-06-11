import { describe, expect, it } from "vitest";

import {
  isValidRegistryAddress,
  mnemonicWordCount,
  normalizeDomain,
  parseFlags,
  parsePublishFlag,
  withRegistryEnv,
  withRegistryGrantEnv,
} from "../scripts/setup.ts";

describe("parseFlags", () => {
  it("defaults every flag when given no args", () => {
    expect(parseFlags([])).toEqual({
      yes: false,
      dryRun: false,
      freshRegistry: false,
      skipApp: false,
    });
  });

  it("round-trips every flag", () => {
    expect(
      parseFlags([
        "--network",
        "previewnet",
        "--yes",
        "--dry-run",
        "--fresh-registry",
        "--skip-app",
        "--domain",
        "foo",
        "--publish",
      ]),
    ).toEqual({
      network: "previewnet",
      domain: "foo",
      yes: true,
      dryRun: true,
      freshRegistry: true,
      skipApp: true,
      publish: true,
    });
  });

  it("--env aliases --network and -y aliases --yes", () => {
    const flags = parseFlags(["--env", "paseo", "-y"]);
    expect(flags.network).toBe("paseo");
    expect(flags.yes).toBe(true);
  });

  it("--non-interactive aliases --yes", () => {
    expect(parseFlags(["--non-interactive"]).yes).toBe(true);
  });

  it("treats --publish/--no-publish as a tri-state, undefined when absent", () => {
    expect(parseFlags(["--publish"]).publish).toBe(true);
    expect(parseFlags(["--no-publish"]).publish).toBe(false);
    expect(parseFlags([]).publish).toBeUndefined();
  });
});

describe("normalizeDomain", () => {
  it("appends .dot when missing and is idempotent", () => {
    expect(normalizeDomain("foo")).toBe("foo.dot");
    expect(normalizeDomain("foo.dot")).toBe("foo.dot");
  });
});

describe("isValidRegistryAddress", () => {
  it("accepts a 0x + 40-hex address and rejects malformed input", () => {
    expect(isValidRegistryAddress("0x70f6a449d770931419cfa8d8412e3a5d6377e905")).toBe(true);
    expect(isValidRegistryAddress("0xabc")).toBe(false);
    expect(isValidRegistryAddress("")).toBe(false);
    expect(isValidRegistryAddress(undefined)).toBe(false);
  });
});

describe("mnemonicWordCount", () => {
  it("counts whitespace-collapsed words", () => {
    expect(mnemonicWordCount("")).toBe(0);
    expect(mnemonicWordCount("  one   two  three ")).toBe(3);
  });
});

describe("parsePublishFlag", () => {
  it("treats true/1/yes (any case) as true and everything else as false", () => {
    for (const v of ["true", "TRUE", "1", "yes", "Yes"]) expect(parsePublishFlag(v)).toBe(true);
    for (const v of ["false", "0", "no", "", undefined, "  "]) expect(parsePublishFlag(v)).toBe(false);
  });
});

describe("withRegistryEnv", () => {
  it("overrides stale inherited registry variables for child processes", () => {
    const inherited = {
      VITE_W3SPAY_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      W3SPAY_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
      OTHER: "kept",
    };

    const env = withRegistryEnv(
      inherited,
      "0x3333333333333333333333333333333333333333",
    );

    expect(env).toMatchObject({
      VITE_W3SPAY_REGISTRY_ADDRESS: "0x3333333333333333333333333333333333333333",
      W3SPAY_REGISTRY_ADDRESS: "0x3333333333333333333333333333333333333333",
      OTHER: "kept",
    });
    expect(inherited.VITE_W3SPAY_REGISTRY_ADDRESS).toBe(
      "0x1111111111111111111111111111111111111111",
    );
  });
});

describe("withRegistryGrantEnv", () => {
  it("builds the super-admin grant environment without mutating inherited env", () => {
    const inherited: NodeJS.ProcessEnv = {
      VITE_W3SPAY_REGISTRY_ADDRESS: "0x1111111111111111111111111111111111111111",
      W3SPAY_REGISTRY_ADDRESS: "0x2222222222222222222222222222222222222222",
      W3SPAY_ADMIN: "0x4444444444444444444444444444444444444444",
    };

    const env = withRegistryGrantEnv(
      inherited,
      "0x3333333333333333333333333333333333333333",
      "paseo-next-v2",
      "deployer seed words",
      "W3SPAY_SUPER_ADMIN",
      "0x5555555555555555555555555555555555555555",
    );

    expect(env).toMatchObject({
      VITE_W3SPAY_REGISTRY_ADDRESS: "0x3333333333333333333333333333333333333333",
      W3SPAY_REGISTRY_ADDRESS: "0x3333333333333333333333333333333333333333",
      NETWORK: "paseo-next-v2",
      DEPLOYER_SEED: "deployer seed words",
      W3SPAY_ADMIN: "0x4444444444444444444444444444444444444444",
      W3SPAY_SUPER_ADMIN: "0x5555555555555555555555555555555555555555",
    });
    expect(inherited.W3SPAY_SUPER_ADMIN).toBeUndefined();
  });
});
