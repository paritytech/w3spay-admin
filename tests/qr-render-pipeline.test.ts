import { describe, expect, it } from "vitest";
import {
  Color,
  CorrectionLevel,
  DEFAULT_MAX_MODULES,
  qrModuleCount,
  renderUrQr,
} from "@bcts/multipart-ur";

import { buildT3rminalConfigPayloadV2, encodeT3rminalConfigPayloadV2 } from "@shared/lib/t3rminal-config-qr.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

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

const REPORT_PASSWORD = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const TEXT_ENCODER = new TextEncoder();

function makePayload(items: ItemConfig["items"]) {
  return buildT3rminalConfigPayloadV2({
    merchant,
    config: {
      id: "bar",
      name: "Bar",
      updatedAt: "2026-05-25T10:00:00Z",
      items,
    },
    reportPassword: REPORT_PASSWORD,
    issuedAt: "2026-05-26T10:00:00Z",
  });
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(buf: Uint8Array, prefix: Uint8Array): boolean {
  if (buf.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (buf[i] !== prefix[i]) return false;
  return true;
}

describe("BCTS QR render pipeline", () => {
  it("static path produces a PNG within the density budget for a small config", () => {
    const payload = makePayload([
      { id: "sku-001", name: "Tequila Shot", price: 4 },
      { id: "sku-002", name: "Aperol Spritz", price: 8.5 },
    ]);
    const { qrString } = encodeT3rminalConfigPayloadV2(payload);
    const moduleCount = qrModuleCount(TEXT_ENCODER.encode(qrString), CorrectionLevel.Low);
    expect(moduleCount).toBeLessThanOrEqual(DEFAULT_MAX_MODULES);

    const rendered = renderUrQr(
      qrString,
      CorrectionLevel.Low,
      320,
      Color.BLACK,
      Color.WHITE,
      1,
      null,
    );
    const png = rendered.toPng();
    expect(png.byteLength).toBeGreaterThan(0);
    expect(startsWith(png, PNG_SIGNATURE)).toBe(true);
  });

  it("renders a static QR for a small config carrying a restaurant profile", () => {
    const payload = buildT3rminalConfigPayloadV2({
      merchant,
      config: {
        id: "bar",
        name: "Bar",
        updatedAt: "2026-05-25T10:00:00Z",
        items: [{ id: "sku-001", name: "Tequila Shot", price: 4 }],
      },
      reportPassword: REPORT_PASSWORD,
      issuedAt: "2026-05-26T10:00:00Z",
      profile: {
        name: "Funkhaus Berlin Events GmbH",
        addressLine1: "Nalepastra\u00dfe 18",
        addressLine2: "12459 Berlin",
        phone: "030/12085416",
        taxId: "DE263789123",
      },
    });
    const { qrString } = encodeT3rminalConfigPayloadV2(payload);
    const moduleCount = qrModuleCount(TEXT_ENCODER.encode(qrString), CorrectionLevel.Low);
    expect(moduleCount).toBeLessThanOrEqual(DEFAULT_MAX_MODULES);

    const png = renderUrQr(qrString, CorrectionLevel.Low, 320, Color.BLACK, Color.WHITE, 1, null).toPng();
    expect(png.byteLength).toBeGreaterThan(0);
    expect(startsWith(png, PNG_SIGNATURE)).toBe(true);
  });

  it("keeps the documented spec sample a single static QR (89 modules, 963-byte UR)", () => {
    // Mirrors docs/specs/t3rminal-config-ur-code.md — the full
    // profile-bearing sample. Locks the producer's static-QR claim.
    const payload = buildT3rminalConfigPayloadV2({
      merchant: {
        ...merchant,
        key: "0x9a3c1f8e2b7d4a6005c9e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6",
        terminalId: "t3r-feedbeefcafef00d112233445566778899aabbccddeeff00123456789abcdef0",
      },
      config: {
        id: "bar",
        name: "Bar",
        updatedAt: "2026-05-25T10:00:00Z",
        items: [
          { id: "sku-001", name: "Tequila Shot", price: 4 },
          { id: "sku-002", name: "Aperol Spritz", price: 8.5 },
        ],
      },
      reportPassword: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
      issuedAt: "2026-05-26T10:00:00Z",
      profile: {
        name: "Funkhaus Berlin Events GmbH",
        addressLine1: "Nalepastra\u00dfe 18",
        addressLine2: "12459 Berlin",
        phone: "030/12085416",
        taxId: "DE263789123",
      },
    });
    const { qrString, byteLength } = encodeT3rminalConfigPayloadV2(payload);
    expect(byteLength).toBe(963);
    const moduleCount = qrModuleCount(TEXT_ENCODER.encode(qrString), CorrectionLevel.Low);
    expect(moduleCount).toBe(89);
    expect(moduleCount).toBeLessThanOrEqual(DEFAULT_MAX_MODULES);
  });
});
