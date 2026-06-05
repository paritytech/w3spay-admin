/**
 * T3rminal-merchant ↔ item-config assignment contract.
 *
 * The local assignment record is the only persistence layer that holds
 * the `(merchantKey, itemConfigCid, reportPassword)` triple. These tests
 * pin three invariants that the Configure-T3rminal screen relies on:
 *
 *   - First assignment derives a password from the admin product
 *     public key + a fresh salt.
 *   - Re-selecting a different published config for the same merchant
 *     keeps the previously-derived password unchanged.
 *   - Explicit regeneration rotates BOTH the salt and the password.
 *
 * We test against `mintAssignmentRecord` directly so we don't have to
 * mount React + a fake KV store just to exercise the rule.
 */

import { describe, expect, it } from "vitest";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { ItemConfig } from "@features/items/items-model.ts";
import {
  decodeAssignmentsPayload,
  encodeAssignmentsPayload,
  mintAssignmentRecord,
  type T3rminalAssignmentV1,
} from "@shared/store/t3rminal-assignments.ts";

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
  it("derives a password from the admin public key on first assignment", () => {
    const record = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      regeneratePassword: false,
      nowIso: NOW,
    });
    expect(record.merchantKey).toBe(merchant.key);
    expect(record.itemConfigId).toBe("bar");
    expect(record.itemConfigCid).toBe("cid-bar");
    expect(record.passwordScheme).toBe("admin-public-key-sha256-v1");
    // 32 bytes → base64url 43 chars (no padding).
    expect(record.reportPassword).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(record.passwordSaltHex).toMatch(/^0x[0-9a-f]{32}$/);
    expect(record.adminPublicKeyHex.length).toBe(2 + PUBLIC_KEY.length * 2);
  });

  it("preserves the existing password when re-selecting a different config", () => {
    const first = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      regeneratePassword: false,
      nowIso: NOW,
    });
    const switched = mintAssignmentRecord({
      merchant,
      config: cafeConfig,
      itemConfigCid: "cid-cafe",
      adminPublicKey: PUBLIC_KEY,
      existing: first,
      regeneratePassword: false,
      nowIso: "2026-05-26T11:00:00Z",
    });
    expect(switched.reportPassword).toBe(first.reportPassword);
    expect(switched.passwordSaltHex).toBe(first.passwordSaltHex);
    expect(switched.itemConfigId).toBe("cafe");
    expect(switched.itemConfigCid).toBe("cid-cafe");
  });

  it("rotates salt + password when regeneratePassword is set", () => {
    const first = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      regeneratePassword: false,
      nowIso: NOW,
    });
    const rotated = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: first,
      regeneratePassword: true,
      nowIso: NOW,
    });
    expect(rotated.passwordSaltHex).not.toBe(first.passwordSaltHex);
    expect(rotated.reportPassword).not.toBe(first.reportPassword);
  });
});

describe("assignments payload codec", () => {
  it("roundtrips encode → decode for the in-memory map", () => {
    const record: T3rminalAssignmentV1 = mintAssignmentRecord({
      merchant,
      config: barConfig,
      itemConfigCid: "cid-bar",
      adminPublicKey: PUBLIC_KEY,
      existing: null,
      regeneratePassword: false,
      nowIso: NOW,
    });
    const map = new Map<string, T3rminalAssignmentV1>([[record.merchantKey, record]]);
    const encoded = encodeAssignmentsPayload(map);
    const decoded = decodeAssignmentsPayload(encoded);
    expect(decoded.get(record.merchantKey)).toEqual(record);
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
