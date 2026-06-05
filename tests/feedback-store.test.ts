import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

// The feedback store is a process singleton; reset its rendered slice +
// drive its debounce timers deterministically with fake timers.
describe("feedback store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useFeedbackStore.setState({ copiedField: null, toast: null });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("shows an ok toast and auto-dismisses after the default duration", () => {
    useFeedbackStore.getState().showToast("Saved");
    expect(useFeedbackStore.getState().toast).toEqual({ msg: "Saved", tone: "ok", loading: false });
    vi.advanceTimersByTime(2399);
    expect(useFeedbackStore.getState().toast).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("honors an explicit duration and tone", () => {
    useFeedbackStore.getState().showToast("Heads up", "warn", { durationMs: 500 });
    expect(useFeedbackStore.getState().toast?.tone).toBe("warn");
    vi.advanceTimersByTime(500);
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("keeps a loading toast up — never auto-dismisses", () => {
    useFeedbackStore
      .getState()
      .showToast("Broadcasting…", "ok", { loading: true, durationMs: null });
    vi.advanceTimersByTime(60_000);
    expect(useFeedbackStore.getState().toast?.loading).toBe(true);
  });

  it("a new toast replaces the previous one's pending dismissal", () => {
    useFeedbackStore.getState().showToast("first");
    vi.advanceTimersByTime(2000);
    useFeedbackStore.getState().showToast("second");
    // The first toast's 2400ms timer must have been cancelled.
    vi.advanceTimersByTime(2399);
    expect(useFeedbackStore.getState().toast?.msg).toBe("second");
    vi.advanceTimersByTime(1);
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("dismissToast clears immediately", () => {
    useFeedbackStore.getState().showToast("x");
    useFeedbackStore.getState().dismissToast();
    expect(useFeedbackStore.getState().toast).toBeNull();
  });

  it("copyValue sets the copied field and clears after the pill duration", () => {
    useFeedbackStore.getState().copyValue("0xabc", "address");
    expect(useFeedbackStore.getState().copiedField).toBe("address");
    vi.advanceTimersByTime(1500);
    expect(useFeedbackStore.getState().copiedField).toBeNull();
  });
});
