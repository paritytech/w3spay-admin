import { describe, expect, it } from "vitest";

import { processorListViewState } from "@features/payment-processors/payment-processor-model.ts";

describe("processorListViewState", () => {
  it("shows the skeleton on the initial fetch", () => {
    expect(
      processorListViewState({ isLoading: true, isError: false, error: null, rowCount: 0 }),
    ).toEqual({ kind: "skeleton" });
  });

  it("surfaces a failed fetch as an error, never as the empty state", () => {
    expect(
      processorListViewState({
        isLoading: false,
        isError: true,
        error: new Error("contract read getAllProcessorConfigIds failed"),
        rowCount: 0,
      }),
    ).toEqual({ kind: "error", message: "contract read getAllProcessorConfigIds failed" });
  });

  it("stringifies non-Error rejections", () => {
    expect(
      processorListViewState({ isLoading: false, isError: true, error: "boom", rowCount: 0 }),
    ).toEqual({ kind: "error", message: "boom" });
  });

  it("keeps showing rows when a background refetch fails", () => {
    expect(
      processorListViewState({
        isLoading: false,
        isError: true,
        error: new Error("transient"),
        rowCount: 2,
      }),
    ).toEqual({ kind: "rows" });
  });

  it("is empty only when settled, error-free, and zero rows", () => {
    expect(
      processorListViewState({ isLoading: false, isError: false, error: null, rowCount: 0 }),
    ).toEqual({ kind: "empty" });
  });

  it("renders rows for a settled non-empty query", () => {
    expect(
      processorListViewState({ isLoading: false, isError: false, error: null, rowCount: 1 }),
    ).toEqual({ kind: "rows" });
  });
});
