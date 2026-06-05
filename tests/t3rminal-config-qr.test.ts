/**
 * QR payload + report-password contract.
 *
 * - Password derivation must be deterministic (same key + salt → same
 *   password) and salt-sensitive (different salts → different passwords).
 * - The payload must carry the item-config CID, not the full config body,
 *   so the QR fits and the T3rminal colleague's scanner only sees a tiny
 *   pointer.
 * - The encoded payload roundtrips through `JSON.parse` and stays under
 *   the static-QR byte guard.
 */

import { describe, expect, it } from "vitest";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import {
  T3RMINAL_QR_PAYLOAD_BYTE_LIMIT,
  T3RMINAL_QR_TYPE,
  T3RMINAL_QR_VERSION,
  T3RMINAL_QR_VERSION_V2,
  T3RMINAL_REPORT_PASSWORD_SCHEME_V1,
  buildT3rminalConfigPayload,
  buildT3rminalConfigPayloadV2,
  createPasswordSeed,
  deriveReportPassword,
  encodeT3rminalConfigPayload,
  encodeT3rminalConfigPayloadV2,
} from "@shared/utils/t3rminal-config-qr.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import { decodeT3rminalConfigQr } from "@/config-qr";

const PUBLIC_KEY = new Uint8Array(32).fill(0xab);
const SALT_A = new Uint8Array(16).fill(0x01);
const SALT_B = new Uint8Array(16).fill(0x02);

const merchant: AdminMerchant = {
  key: "0xkey",
  merchantId: "funkhaus",
  terminalId: "t3r-feedbeef",
  name: "Bar East",
  displayName: "Bar East",
  status: "active",
  kind: "t3rminal",
  destinationAccountId: "0xabcd",
  destinationSs58: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
  derivedH160: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-25T00:00:00Z",
};

describe("report password derivation", () => {
  it("is deterministic for the same public key + salt", () => {
    const a = deriveReportPassword(PUBLIC_KEY, SALT_A);
    const b = deriveReportPassword(PUBLIC_KEY, SALT_A);
    expect(a).toEqual(b);
  });

  it("changes when the salt changes", () => {
    expect(deriveReportPassword(PUBLIC_KEY, SALT_A)).not.toEqual(
      deriveReportPassword(PUBLIC_KEY, SALT_B),
    );
  });

  it("changes when the public key changes", () => {
    const otherKey = new Uint8Array(32).fill(0xcd);
    expect(deriveReportPassword(PUBLIC_KEY, SALT_A)).not.toEqual(
      deriveReportPassword(otherKey, SALT_A),
    );
  });

  it("base64url-encodes 32 bytes of digest", () => {
    const password = deriveReportPassword(PUBLIC_KEY, SALT_A);
    // base64url uses [A-Za-z0-9_-] with no padding; 32 bytes → 43 chars.
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(password.length).toBe(43);
  });

  it("createPasswordSeed returns a salt + matching password", () => {
    const seed = createPasswordSeed(PUBLIC_KEY);
    expect(seed.salt.length).toBe(16);
    expect(seed.password).toEqual(deriveReportPassword(PUBLIC_KEY, seed.salt));
  });
});

describe("QR payload encoding", () => {
  const payload = buildT3rminalConfigPayload({
    merchant,
    itemConfigId: "bar",
    itemConfigCid: "bafkreigh2akiscaildc26b3xbcoab4y3afyywjcttzkv6f7vfyqgwwxe7q",
    reportPassword: deriveReportPassword(PUBLIC_KEY, SALT_A),
    registryAddress: "0xfec1497a5fbfc2583ea52bc7504701f95ea4a68a",
    issuedAt: "2026-05-26T10:00:00Z",
  });

  it("carries the CID + registry, not the full item config", () => {
    expect(payload.v).toBe(T3RMINAL_QR_VERSION);
    expect(payload.type).toBe(T3RMINAL_QR_TYPE);
    expect(payload.passwordScheme).toBe(T3RMINAL_REPORT_PASSWORD_SCHEME_V1);
    expect(payload.itemConfigId).toBe("bar");
    expect(payload.itemConfigCid).toMatch(/^bafkre/);
    expect(payload.registryAddress).toBe("0xfec1497a5fbfc2583ea52bc7504701f95ea4a68a");
    expect((payload as unknown as Record<string, unknown>).config).toBeUndefined();
    expect((payload as unknown as Record<string, unknown>).items).toBeUndefined();
  });

  it("encodes minified JSON that roundtrips", () => {
    const json = encodeT3rminalConfigPayload(payload);
    expect(json).not.toMatch(/\n\s/);
    expect(JSON.parse(json)).toEqual(payload);
  });

  it("stays under the static QR byte guard", () => {
    const json = encodeT3rminalConfigPayload(payload);
    const size = new TextEncoder().encode(json).length;
    expect(size).toBeLessThan(T3RMINAL_QR_PAYLOAD_BYTE_LIMIT);
  });

  it("throws when the encoded payload exceeds the byte guard", () => {
    const oversized = buildT3rminalConfigPayload({
      merchant: { ...merchant, displayName: "x".repeat(T3RMINAL_QR_PAYLOAD_BYTE_LIMIT) },
      itemConfigId: "bar",
      itemConfigCid: "cid",
      reportPassword: "p",
      registryAddress: "0x0",
      issuedAt: "2026-05-26T10:00:00Z",
    });
    expect(() => encodeT3rminalConfigPayload(oversized)).toThrow(/QR payload too large/);
  });
});

const SAMPLE_REPORT_PASSWORD = deriveReportPassword(PUBLIC_KEY, SALT_A);

const sampleConfig: ItemConfig = {
  id: "bar",
  name: "Bar",
  updatedAt: "2026-05-25T10:00:00Z",
  items: [
    { id: "sku-001", name: "Tequila Shot", price: 4 },
    { id: "sku-002", name: "Aperol Spritz", price: 8.5 },
  ],
};

describe("v2 QR payload (BCTS UR + dCBOR)", () => {
  it("buildT3rminalConfigPayloadV2 embeds the full item config and merchant binding", () => {
    const payload = buildT3rminalConfigPayloadV2({
      merchant,
      config: sampleConfig,
      reportPassword: SAMPLE_REPORT_PASSWORD,
      issuedAt: "2026-05-26T10:00:00Z",
    });
    expect(payload.v).toBe(T3RMINAL_QR_VERSION_V2);
    expect(payload.type).toBe(T3RMINAL_QR_TYPE);
    expect(payload.passwordScheme).toBe(T3RMINAL_REPORT_PASSWORD_SCHEME_V1);
    expect(payload.merchantKey).toBe(merchant.key);
    expect(payload.receivingAddress).toBe(merchant.destinationSs58);
    expect(payload.config.id).toBe("bar");
    expect(payload.config.items.map((i) => i.pricePlancks)).toEqual(["4000000", "8500000"]);
    expect(payload.config.items.map((i) => i.price)).toEqual([4, 8.5]);
  });

  it("encodes to an uppercase ur:t3rminal-config/... QR string and decodes back via the shared decoder", () => {
    const payload = buildT3rminalConfigPayloadV2({
      merchant,
      config: sampleConfig,
      reportPassword: SAMPLE_REPORT_PASSWORD,
      issuedAt: "2026-05-26T10:00:00Z",
    });
    const { qrString, byteLength, ur } = encodeT3rminalConfigPayloadV2(payload);
    expect(qrString.startsWith("UR:T3RMINAL-CONFIG/")).toBe(true);
    expect(byteLength).toBeGreaterThan(0);
    expect(ur.urTypeStr()).toBe(T3RMINAL_QR_TYPE);

    const decoded = decodeT3rminalConfigQr(qrString);
    expect(decoded?.kind).toBe("v2-ur");
    if (decoded?.kind !== "v2-ur") throw new Error("unreachable");
    expect(decoded.payload).toEqual(payload);
  });

  it("throws when an item has more fractional digits than the wire scale supports", () => {
    const badConfig: ItemConfig = {
      id: "x",
      name: "X",
      updatedAt: "2026-05-25T10:00:00Z",
      items: [{ id: "sku-bad", name: "Bad", price: 0.0000001 }],
    };
    expect(() =>
      buildT3rminalConfigPayloadV2({
        merchant,
        config: badConfig,
        reportPassword: SAMPLE_REPORT_PASSWORD,
        issuedAt: "2026-05-26T10:00:00Z",
      }),
    ).toThrow(/decimal places/);
  });
});

describe("v2 QR payload — restaurant profile (key 11)", () => {
  const profile = {
    name: "Funkhaus Berlin Events GmbH",
    addressLine1: "Nalepastra\u00dfe 18",
    addressLine2: "12459 Berlin",
    phone: "030/12085416",
    taxId: "DE263789123",
  };

  it("embeds the profile inline and round-trips it through the shared decoder", () => {
    const payload = buildT3rminalConfigPayloadV2({
      merchant,
      config: sampleConfig,
      reportPassword: SAMPLE_REPORT_PASSWORD,
      issuedAt: "2026-05-26T10:00:00Z",
      profile,
    });
    expect(payload.profile).toEqual(profile);

    const { qrString } = encodeT3rminalConfigPayloadV2(payload);
    const decoded = decodeT3rminalConfigQr(qrString);
    expect(decoded?.kind).toBe("v2-ur");
    if (decoded?.kind !== "v2-ur") throw new Error("unreachable");
    expect(decoded.payload.profile).toEqual(profile);
  });

  it("omits the profile entirely when none is supplied", () => {
    const payload = buildT3rminalConfigPayloadV2({
      merchant,
      config: sampleConfig,
      reportPassword: SAMPLE_REPORT_PASSWORD,
      issuedAt: "2026-05-26T10:00:00Z",
    });
    expect(payload.profile).toBeUndefined();
    const { qrString } = encodeT3rminalConfigPayloadV2(payload);
    const decoded = decodeT3rminalConfigQr(qrString);
    if (decoded?.kind !== "v2-ur") throw new Error("unreachable");
    expect("profile" in decoded.payload).toBe(false);
  });
});
