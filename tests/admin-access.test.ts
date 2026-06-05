import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { envConfig } from "@shared/config.ts";
import { getAdminProductIdentifier } from "@shared/utils/get-admin-product-id.ts";
import {
  InvalidAdminAddressError,
  InvalidDestinationAccountError,
  accountId32ToH160IfLeftPadded,
  h160ToAccountId32,
  isAccountId32Hex,
  isH160Address,
  normalizeAccountId32Hex,
  normalizeH160Address,
  normalizeMerchantDestinationInput,
  publicKeyToSs58,
  deriveH160,
} from "@shared/utils/address.ts";
import { shortenAddress } from "@shared/utils/format.ts";
import {
  buildAdminGrantIdentity,
  selectAdminCopyTarget,
} from "@features/session/account.ts";
import { withTimeout } from "@shared/utils/with-timeout.ts";
import { detectHostEnvironment } from "@shared/api/host-connection.ts";
import { AdminAccess, AdminAccountCard } from "@features/session/pages/AdminAccess.tsx";

const PUBLIC_KEY_HEX = "d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d";

function publicKeyBytes(): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = parseInt(PUBLIC_KEY_HEX.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("withTimeout", () => {
  it("rejects instead of leaving a hung product-account request unresolved", async () => {
    vi.useFakeTimers();
    // A promise that never settles, so only the timeout can resolve the race.
    const result = withTimeout(Promise.withResolvers<never>().promise, 25, "getProductAccount(w3spayadmin.dot)");
    const rejection = expect(result).rejects.toThrow(
      "getProductAccount(w3spayadmin.dot) timed out after 25ms",
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });
});

describe("envConfig.host.productDotNs identifier", () => {
  it("is the registered manifest dotNS id — not window.location.host", () => {
    // Ensures the product account call always uses the stable .dot identifier
    // regardless of the iframe URL dotli happens to use (which can be
    // "w3spayadmin.dot.li" or an IPFS gateway URL).
    expect(envConfig.host.productDotNs).toBe("w3spayadmin.dot");
  });
});

describe("getAdminProductIdentifier", () => {
  function stubHostname(hostname: string, host: string = hostname) {
    vi.stubGlobal("window", { location: { hostname, host } } as never);
  }

  it("returns the manifest fallback in non-browser environments", () => {
    vi.stubGlobal("window", undefined as never);
    expect(getAdminProductIdentifier()).toBe(envConfig.host.productDotNs);
  });

  it("uses host:port for localhost so the dev server matches the host's URL-based registration", () => {
    stubHostname("localhost", "localhost:5175");
    expect(getAdminProductIdentifier()).toBe("localhost:5175");
  });

  it("strips the `.li` from Bulletin gateway hosts so mobile loads validate", () => {
    stubHostname("w3spayadmin.dot.li");
    expect(getAdminProductIdentifier()).toBe("w3spayadmin.dot");
  });

  it("passes through direct `.dot` browser hostnames untouched", () => {
    stubHostname("w3spayadmin.dot");
    expect(getAdminProductIdentifier()).toBe("w3spayadmin.dot");
  });

  it("falls back to the manifest id for IPFS gateway / preview URLs", () => {
    stubHostname("bafy123.ipfs.dweb.link");
    expect(getAdminProductIdentifier()).toBe(envConfig.host.productDotNs);
  });
});

describe("detectHostEnvironment", () => {
  it("matches t3rminal-v1 webview marker detection", () => {
    const fakeWindow: Record<string, unknown> = { __HOST_WEBVIEW_MARK__: true };
    Object.defineProperty(fakeWindow, "top", { get: () => fakeWindow });
    vi.stubGlobal("window", fakeWindow);

    expect(detectHostEnvironment()).toBe("desktop-webview");
  });

  it("matches t3rminal-v1 iframe detection", () => {
    const fakeWindow: Record<string, unknown> = {};
    Object.defineProperty(fakeWindow, "top", { get: () => ({}) });
    vi.stubGlobal("window", fakeWindow);

    expect(detectHostEnvironment()).toBe("web-iframe");
  });
});

describe("publicKeyToSs58", () => {
  it("encodes Alice's public key to the canonical SS58-42 address", () => {
    // 0xd43593...da27d is Alice's sr25519 public key. With network prefix
    // 42 (generic substrate) this is the canonical Alice SS58.
    expect(publicKeyToSs58(publicKeyBytes())).toBe(
      "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    );
  });

  it("rejects non-32-byte buffers", () => {
    expect(() => publicKeyToSs58(new Uint8Array(20))).toThrow();
  });
});

describe("deriveH160", () => {
  it("matches the pallet-revive native-account mapping used by t3rminal", () => {
    expect(deriveH160(publicKeyBytes())).toBe("0x9621dde636de098b43efb0fa9b61facfe328f99d");
  });

  it("recovers the original H160 for revive-mapped AccountIds", () => {
    const publicKey = new Uint8Array(32);
    for (let i = 0; i < 20; i += 1) publicKey[i] = i + 1;
    publicKey.fill(0xee, 20);
    expect(deriveH160(publicKey)).toBe("0x0102030405060708090a0b0c0d0e0f1011121314");
  });
});

describe("H160 normalization", () => {
  it("lowercases EIP-55-cased input", () => {
    expect(normalizeH160Address("0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd")).toBe(
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
  });

  it("recognizes 20-byte hex", () => {
    expect(isH160Address("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(true);
    expect(isH160Address("0xshort")).toBe(false);
    expect(isH160Address("0x" + "ab".repeat(32))).toBe(false);
  });

  it("rejects non-H160 input", () => {
    expect(() => normalizeH160Address("not-an-address")).toThrow(InvalidAdminAddressError);
  });
});

describe("AccountId32 normalization", () => {
  it("lowercases 32-byte hex", () => {
    const upper = "0x" + "AB".repeat(32);
    expect(normalizeAccountId32Hex(upper)).toBe(("0x" + "ab".repeat(32)) as `0x${string}`);
  });

  it("rejects shorter inputs", () => {
    expect(() => normalizeAccountId32Hex("0xabcd")).toThrow(InvalidDestinationAccountError);
  });

  it("recognizes 32-byte hex via isAccountId32Hex", () => {
    expect(isAccountId32Hex("0x" + "ab".repeat(32))).toBe(true);
    expect(isAccountId32Hex("0x" + "ab".repeat(20))).toBe(false);
  });

  it("converts H160 to left-padded AccountId32 and back", () => {
    const h160 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const padded = h160ToAccountId32(h160);
    expect(padded).toBe("0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(accountId32ToH160IfLeftPadded(padded)).toBe(h160);
  });

  it("returns null when the AccountId32 is not left-padded H160", () => {
    expect(
      accountId32ToH160IfLeftPadded(
        "0x0102030405060708090a0b0c0d0e0f1011121314151617181920212223242526",
      ),
    ).toBeNull();
  });
});

describe("normalizeMerchantDestinationInput", () => {
  it("accepts SS58 and yields the raw public key", () => {
    expect(
      normalizeMerchantDestinationInput("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"),
    ).toBe(`0x${PUBLIC_KEY_HEX}` as `0x${string}`);
  });

  it("accepts a 0x-prefixed AccountId32", () => {
    const padded = "0x" + "cd".repeat(32);
    expect(normalizeMerchantDestinationInput(padded)).toBe(padded.toLowerCase());
  });

  it("accepts an H160 and left-pads it", () => {
    expect(normalizeMerchantDestinationInput("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd")).toBe(
      "0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
  });

  it("rejects anything else", () => {
    expect(() => normalizeMerchantDestinationInput("not-an-address")).toThrow(
      InvalidDestinationAccountError,
    );
  });
});

describe("buildAdminGrantIdentity / selectAdminCopyTarget", () => {
  it("populates ss58, adminH160, and the copy target", () => {
    const identity = buildAdminGrantIdentity(
      publicKeyBytes(),
      "0xABcDefAbcdefAbCdEfAbCdEfAbCdEfAbCdEfAbCd",
    );
    expect(identity.ss58Address).toBe("5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY");
    expect(identity.accountId32).toBe(`0x${PUBLIC_KEY_HEX}`);
    expect(identity.productIdentifier).toBe("w3spayadmin.dot");
    expect(identity.derivationIndex).toBe(0);
    expect(identity.adminH160).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(identity.copyTarget).toBe(identity.adminH160);
    expect(selectAdminCopyTarget(identity)).toBe(identity.adminH160);
  });
});

describe("AdminAccountCard", () => {
  it("renders the resolved H160 and SS58 account addresses with copy affordances", () => {
    const identity = buildAdminGrantIdentity(
      publicKeyBytes(),
      "0xABcDefAbcdefAbCdEfAbCdEfAbCdEfAbCdEfAbCd",
    );

    const html = renderToStaticMarkup(
      createElement(AdminAccountCard, {
        identity,
      }),
    );

    expect(html).toContain(identity.adminH160);
    expect(html).toContain(identity.ss58Address);
    expect(html).toContain("Copy H160");
    expect(html).toContain("Copy SS58");
  });
});

describe("AdminAccess", () => {
  it("keeps the resolved account visible while the registry admin check is pending", () => {
    const identity = buildAdminGrantIdentity(
      publicKeyBytes(),
      "0xABcDefAbcdefAbCdEfAbCdEfAbCdEfAbCdEfAbCd",
    );

    const html = renderToStaticMarkup(
      createElement(AdminAccess, {
        variant: { kind: "checking-admin", identity },
        onRequestAccess: () => undefined,
        onCheckAgain: () => undefined,
        onRetryHostPermissions: () => undefined,
        checkInFlight: true,
        permissionsRetryInFlight: false,
      }),
    );

    expect(html).toContain("Checking registry access");
    expect(html).toContain(identity.adminH160);
    expect(html).toContain(identity.ss58Address);
    expect(html).toContain("Checking…");
  });

  it("does not offer a host login request while product-account resolution is in flight", () => {
    const html = renderToStaticMarkup(
      createElement(AdminAccess, {
        variant: { kind: "resolving" },
        onRequestAccess: () => undefined,
        onCheckAgain: () => undefined,
        onRetryHostPermissions: () => undefined,
        checkInFlight: false,
        permissionsRetryInFlight: false,
      }),
    );

    expect(html).toContain("Resolving your product account");
    expect(html).not.toContain("Request admin access");
  });
});

describe("shortenAddress", () => {
  it("returns the value untouched when already short", () => {
    expect(shortenAddress("0xabc")).toBe("0xabc");
  });

  it("ellipsifies long values around the configured window", () => {
    const value = "0x" + "ab".repeat(32);
    expect(shortenAddress(value, 6, 4)).toBe(`${value.slice(0, 6)}…${value.slice(-4)}`);
  });

  it("falls back to an em dash for nullish input", () => {
    expect(shortenAddress(null)).toBe("—");
    expect(shortenAddress(undefined)).toBe("—");
  });
});
