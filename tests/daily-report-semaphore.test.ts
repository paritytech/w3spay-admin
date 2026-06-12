import { afterEach, describe, expect, it, vi } from "vitest";

import { loadDailyReport, MAX_CONCURRENCY } from "@features/reports/contracts/report-queries.ts";

// Track how many IPFS fetches the daily-report loader runs at once. The
// mock is hoisted (via `vi.hoisted` + the hoisted `vi.mock` factory) so a
// plain static `import` of the module-under-test still observes it.
const tracker = vi.hoisted(() => ({ active: 0, peak: 0 }));

vi.mock("@features/reports/contracts/fetch-report.ts", () => ({
  fetchReportEnvelope: vi.fn(async () => {
    tracker.active += 1;
    tracker.peak = Math.max(tracker.peak, tracker.active);
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 5);
    await promise;
    tracker.active -= 1;
    // A legacy-v1 envelope resolves without touching decrypt — enough to
    // exercise the fetch-side semaphore.
    return { kind: "ok", envelope: { kind: "legacy-v1" } };
  }),
}));

afterEach(() => {
  tracker.active = 0;
  tracker.peak = 0;
});

describe("daily-report fetch semaphore", () => {
  it("caps concurrent IPFS fetches at MAX_CONCURRENCY", async () => {
    const jobs = Array.from({ length: 20 }, (_, i) =>
      loadDailyReport(`cid-${i}`, ["password"], "https://gateway.example"),
    );
    const results = await Promise.all(jobs);

    expect(results).toHaveLength(20);
    expect(results.every((r) => r.kind === "legacy-v1")).toBe(true);

    // 20 jobs through a cap of 6 must saturate exactly to the cap.
    expect(tracker.peak).toBeLessThanOrEqual(MAX_CONCURRENCY);
    expect(tracker.peak).toBe(MAX_CONCURRENCY);
  });
});
