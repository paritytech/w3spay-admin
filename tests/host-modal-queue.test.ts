import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HOST_MODAL_MAX_LOCK_MS,
  runExclusiveHostModal,
  __resetHostModalQueueForTests,
} from "@shared/chain/host/connection.ts";

/**
 * `runExclusiveHostModal` encodes the host invariant that exactly one
 * modal is open at a time (the host silently drops any prompt that arrives
 * while another is up). These tests pin the three properties the boot flow
 * depends on: FIFO ordering, non-overlap, and a ceiling so a never-answered
 * modal can't wedge everything queued behind it.
 *
 * The queue tail is module-global, so reset it between tests to isolate.
 */
afterEach(() => {
  __resetHostModalQueueForTests();
  vi.useRealTimers();
});

describe("runExclusiveHostModal", () => {
  it("runs queued modals one at a time in FIFO enqueue order", async () => {
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;

    const task = (id: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        log.push(`start:${id}`);
        setTimeout(() => {
          log.push(`end:${id}`);
          active -= 1;
          resolve(id);
        }, ms);
      });

    // Descending durations: run concurrently they would settle c, b, a.
    // Serialized, each waits for the previous to close → a, b, c.
    const a = runExclusiveHostModal(task("a", 30));
    const b = runExclusiveHostModal(task("b", 10));
    const c = runExclusiveHostModal(task("c", 1));

    expect(await Promise.all([a, b, c])).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
    expect(log).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
    ]);
  });

  it("returns each task's own outcome and a rejection advances the chain", async () => {
    const log: string[] = [];

    const denied = runExclusiveHostModal(() => {
      log.push("denied");
      return Promise.reject(new Error("denied at host"));
    });
    const granted = runExclusiveHostModal(() => {
      log.push("granted");
      return Promise.resolve("ok");
    });

    // The first prompt's rejection surfaces to its own caller…
    await expect(denied).rejects.toThrow("denied at host");
    // …and does not wedge the prompt queued behind it.
    await expect(granted).resolves.toBe("ok");
    expect(log).toEqual(["denied", "granted"]);
  });

  it("releases the lock after the ceiling so a never-answered modal can't block forever", async () => {
    vi.useFakeTimers();

    let secondStarted = false;
    // First modal never resolves: user backgrounds the app / host wedges.
    void runExclusiveHostModal(() => new Promise<never>(() => {}));
    const second = runExclusiveHostModal(() => {
      secondStarted = true;
      return Promise.resolve("ran");
    });

    // Up to (but not past) the ceiling, the queued modal stays blocked.
    await vi.advanceTimersByTimeAsync(HOST_MODAL_MAX_LOCK_MS - 1);
    expect(secondStarted).toBe(false);

    // Crossing the ceiling frees the lock and the queued modal runs.
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("ran");
    expect(secondStarted).toBe(true);
  });
});
