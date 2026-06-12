import { describe, expect, it } from "vitest";

import {
  runResumeRecovery,
  type ClientProbeResult,
  type ResumeRecoveryDeps,
  type ResumeRecoveryTimings,
} from "@shared/chain/host/resume-recovery.ts";

const FAST_TIMINGS: ResumeRecoveryTimings = {
  pingTimeoutMs: 1,
  pingAttempts: 3,
  pingRetryDelayMs: 0,
  probeTimeoutMs: 1,
};

interface Harness {
  readonly deps: ResumeRecoveryDeps;
  readonly events: string[];
}

function makeHarness(options: {
  readonly pings: readonly boolean[];
  readonly probe?: ClientProbeResult;
}): Harness {
  const events: string[] = [];
  const pings = [...options.pings];
  return {
    events,
    deps: {
      ping: () => {
        events.push("ping");
        return Promise.resolve(pings.shift() ?? false);
      },
      probeClients: () => {
        events.push("probe");
        return Promise.resolve(options.probe ?? "ok");
      },
      rebuild: () => {
        events.push("rebuild");
      },
      invalidateQueries: () => {
        events.push("invalidate");
        return Promise.resolve();
      },
      notifyBridgeDead: () => {
        events.push("notify");
      },
      sleep: () => {
        events.push("sleep");
        return Promise.resolve();
      },
    },
  };
}

describe("runResumeRecovery", () => {
  it("leaves responsive clients alone", async () => {
    const { deps, events } = makeHarness({ pings: [true], probe: "ok" });

    await expect(runResumeRecovery(deps, FAST_TIMINGS)).resolves.toBe("healthy");
    expect(events).toEqual(["ping", "probe"]);
  });

  it("skips the probe when no client has been created yet", async () => {
    const { deps, events } = makeHarness({ pings: [true], probe: "none" });

    await expect(runResumeRecovery(deps, FAST_TIMINGS)).resolves.toBe("no-clients");
    expect(events).toEqual(["ping", "probe"]);
  });

  it("rebuilds stuck clients before refetching queries", async () => {
    const { deps, events } = makeHarness({ pings: [true], probe: "stale" });

    await expect(runResumeRecovery(deps, FAST_TIMINGS)).resolves.toBe("rebuilt");
    expect(events).toEqual(["ping", "probe", "rebuild", "invalidate"]);
  });

  it("retries the ping and recovers when the bridge thaws late", async () => {
    const { deps, events } = makeHarness({ pings: [false, false, true], probe: "ok" });

    await expect(runResumeRecovery(deps, FAST_TIMINGS)).resolves.toBe("healthy");
    expect(events).toEqual(["ping", "sleep", "ping", "sleep", "ping", "probe"]);
  });

  it("notifies and never touches clients when the bridge stays dead", async () => {
    const { deps, events } = makeHarness({ pings: [false, false, false] });

    await expect(runResumeRecovery(deps, FAST_TIMINGS)).resolves.toBe("bridge-dead");
    expect(events).toEqual(["ping", "sleep", "ping", "sleep", "ping", "notify"]);
    expect(events).not.toContain("rebuild");
    expect(events).not.toContain("probe");
  });
});
