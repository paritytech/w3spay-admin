import { describe, expect, it } from "vitest";

import { interpretAllocationOutcome } from "@shared/chain/host/connection.ts";

/** `requestResourceAllocation` returns one `AllocationOutcome` per requested kind; we claim one kind per call. */
describe("interpretAllocationOutcome", () => {
  it("treats Allocated as granted", () => {
    expect(interpretAllocationOutcome([{ tag: "Allocated", value: undefined }])).toEqual({
      granted: true,
    });
  });

  it("treats Rejected as a denial carrying the tag as the reason", () => {
    expect(interpretAllocationOutcome([{ tag: "Rejected", value: undefined }])).toEqual({
      granted: false,
      error: "Rejected",
    });
  });

  it("treats NotAvailable as a denial", () => {
    expect(interpretAllocationOutcome([{ tag: "NotAvailable", value: undefined }])).toEqual({
      granted: false,
      error: "NotAvailable",
    });
  });

  it("interprets the first outcome when the host returns several", () => {
    expect(
      interpretAllocationOutcome([
        { tag: "Rejected", value: undefined },
        { tag: "Allocated", value: undefined },
      ]),
    ).toEqual({ granted: false, error: "Rejected" });
  });

  it("accepts a non-array (legacy single-enum) shape", () => {
    expect(interpretAllocationOutcome({ tag: "Allocated", value: undefined })).toEqual({
      granted: true,
    });
  });

  it("stays permissive on an unrecognized shape so a protocol bump can't wedge signing", () => {
    expect(interpretAllocationOutcome(undefined)).toEqual({ granted: true });
    expect(interpretAllocationOutcome([])).toEqual({ granted: true });
    expect(interpretAllocationOutcome([{ value: 1 }])).toEqual({ granted: true });
  });
});
