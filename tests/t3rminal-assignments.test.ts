import { describe, expect, it } from "vitest";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import {
  decodeAssignmentsPayload,
  encodeAssignmentsPayload,
  mintAssignmentRecord,
  type T3rminalAssignmentV1,
} from "@shared/store/t3rminal-assignments.ts";
import { deriveReportPasswordFromPasscode } from "@shared/lib/t3rminal-config-qr.ts";

const PUBLIC_KEY = new Uint8Array(32).fill(0xab);
const NOW = "2026-05-26T10:00:00Z";

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

const barConfig: ItemConfig = {
  id: "bar",
  name: "Bar",
  updatedAt: "2026-05-25T10:00:00Z",
  items: [
    { id: "sku-001", name: "Tequila Shot", price: 4 },
  ],
};

const cafeConfig: ItemConfig = {
  id: "cafe",
  name: "Café",
  updatedAt: "2026-05-25T10:00:00Z",
  items: [
    { id: "sku-201", name: "Espresso", price: 2.2 },
  ],
};

describe("mintAssignmentRecord", () => {
  const PASSCODE = "fika at three";

  it("derives the report password from the passcode and stores no salt", () => {
    const record = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      passcode: PASSCODE,
      nowIso: NOW,
    });
    expect(record.merchantKey).toBe(merchant.key);
    expect(record.itemConfigId).toBe("bar");
    expect(record.itemConfigCid).toBe("cid-bar");
    expect(record.passwordScheme).toBe("admin-public-key-sha256-v1");
    expect(record.reportPassword).toBe(deriveReportPasswordFromPasscode(PASSCODE));
    expect(record.passwordSaltHex).toBeUndefined();
    expect(record.adminPublicKeyHex.length).toBe(2 + PUBLIC_KEY.length * 2);
  });

  it("keeps the existing password and salt when passcode is null", () => {
    const legacy: T3rminalAssignmentV1 = {
      merchantKey: merchant.key,
      itemConfigId: "bar",
      itemConfigCid: "cid-bar",
      receivingAddress: merchant.destinationSs58,
      passwordScheme: "admin-public-key-sha256-v1",
      reportPassword: "legacy-random-password",
      passwordSaltHex: "0xabcdef0123456789abcdef0123456789",
      adminPublicKeyHex: "0xdead",
      issuedAt: NOW,
      payloadVersion: 2,
    };
    const switched = mintAssignmentRecord({
      merchant,
      config: cafeConfig,
      itemConfigCid: "cid-cafe",
      adminPublicKey: PUBLIC_KEY,
      existing: legacy,
      passcode: null,
      nowIso: "2026-05-26T11:00:00Z",
    });
    expect(switched.reportPassword).toBe(legacy.reportPassword);
    expect(switched.passwordSaltHex).toBe(legacy.passwordSaltHex);
    expect(switched.itemConfigId).toBe("cafe");
    expect(switched.itemConfigCid).toBe("cid-cafe");
  });

  it("replaces the password when a new passcode is given", () => {
    const first = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      passcode: "old passcode",
      nowIso: NOW,
    });
    const rotated = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: first,
      passcode: "new passcode",
      nowIso: NOW,
    });
    expect(rotated.reportPassword).toBe(deriveReportPasswordFromPasscode("new passcode"));
    expect(rotated.reportPassword).not.toBe(first.reportPassword);
    expect(rotated.passwordSaltHex).toBeUndefined();
  });

  it("throws when passcode is null and there is no existing record", () => {
    expect(() =>
      mintAssignmentRecord({
        merchant,
        config: barConfig,
        itemConfigCid: "cid-bar",
        adminPublicKey: PUBLIC_KEY,
        existing: null,
        passcode: null,
        nowIso: NOW,
      }),
    ).toThrow(/no existing password/i);
  });
});

describe("assignments payload codec", () => {
  it("roundtrips a passcode-derived record (no salt) through encode → decode", () => {
    const record: T3rminalAssignmentV1 = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      passcode: "fika at three",
      nowIso: NOW,
    });
    expect(record.passwordSaltHex).toBeUndefined();
    const map = new Map<string, T3rminalAssignmentV1>([[record.merchantKey, record]]);
    const decoded = decodeAssignmentsPayload(encodeAssignmentsPayload(map));
    expect(decoded.get(record.merchantKey)).toEqual(record);
  });

  it("roundtrips a legacy record that still carries passwordSaltHex", () => {
    const legacy: T3rminalAssignmentV1 = {
      merchantKey: merchant.key,
      itemConfigId: "bar",
      itemConfigCid: "cid-bar",
      receivingAddress: merchant.destinationSs58,
      passwordScheme: "admin-public-key-sha256-v1",
      reportPassword: "legacy-random-password",
      passwordSaltHex: "0xabcdef0123456789abcdef0123456789",
      adminPublicKeyHex: "0xdead",
      issuedAt: NOW,
      payloadVersion: 2,
    };
    const map = new Map<string, T3rminalAssignmentV1>([[legacy.merchantKey, legacy]]);
    const decoded = decodeAssignmentsPayload(encodeAssignmentsPayload(map));
    expect(decoded.get(legacy.merchantKey)).toEqual(legacy);
  });

  it("returns an empty map for malformed input", () => {
    expect(decodeAssignmentsPayload(null).size).toBe(0);
    expect(decodeAssignmentsPayload({ version: 99 }).size).toBe(0);
    expect(decodeAssignmentsPayload({ version: 1, assignments: null }).size).toBe(0);
    expect(
      decodeAssignmentsPayload({
        version: 1,
        assignments: { x: { merchantKey: "x" } },
      }).size,
    ).toBe(0);
  });
});
