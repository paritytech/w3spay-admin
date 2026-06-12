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
  deriveReportPasswordFromPasscode,
  encodeT3rminalConfigPayload,
  encodeT3rminalConfigPayloadV2,
} from "@shared/lib/t3rminal-config-qr.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import { decodeT3rminalConfigQr } from "@shared/lib/config-qr";

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

describe("deriveReportPasswordFromPasscode", () => {
  it("is deterministic for the same passcode", () => {
    expect(deriveReportPasswordFromPasscode("hunter2")).toBe(
      deriveReportPasswordFromPasscode("hunter2"),
    );
  });

  it("trims surrounding whitespace", () => {
    expect(deriveReportPasswordFromPasscode("  x  ")).toBe(deriveReportPasswordFromPasscode("x"));
  });

  it("changes when the passcode changes", () => {
    expect(deriveReportPasswordFromPasscode("alpha")).not.toBe(
      deriveReportPasswordFromPasscode("beta"),
    );
  });

  it("produces a 43-char base64url string (sha256, no padding)", () => {
    expect(deriveReportPasswordFromPasscode("hunter2")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("throws on an empty or whitespace-only passcode", () => {
    expect(() => deriveReportPasswordFromPasscode("")).toThrow(/empty/i);
    expect(() => deriveReportPasswordFromPasscode("   ")).toThrow(/empty/i);
  });
});

describe("QR payload encoding", () => {
  const payload = buildT3rminalConfigPayload({
    merchant,
    itemConfigId: "bar",
    itemConfigCid: "bafkreigh2akiscaildc26b3xbcoab4y3afyywjcttzkv6f7vfyqgwwxe7q",
    reportPassword: deriveReportPasswordFromPasscode("test passcode"),
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

const SAMPLE_REPORT_PASSWORD = deriveReportPasswordFromPasscode("test passcode");

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
