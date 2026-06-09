// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";
import * as Sentry from "@sentry/react";

import { breadcrumb, captureError } from "@/shared/lib/sentry";

import { journeyTracker } from "@shared/lib/telemetry.ts";

export function TelemetryTestScreen() {
  const [log, setLog] = useState<string[]>([]);
  const appendLog = (line: string) =>
    setLog((prev) => [`${new Date().toISOString().slice(11, 19)} ${line}`, ...prev].slice(0, 50));

  const testError = () => {
    try {
      throw new Error("admin-telemetry-test: synthetic error");
    } catch (caught) {
      captureError(caught, { test: "synthetic-error" });
      appendLog("captureError fired (synthetic-error)");
    }
  };

  const testBreadcrumb = () => {
    breadcrumb("admin-telemetry-test breadcrumb", { test: "breadcrumb" }, "app");
    appendLog("breadcrumb emitted (test=breadcrumb)");
  };

  const testSuccessJourney = () => {
    // Use chain-write so the dashboard's saved search picks it up.
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "register-merchant" });
    setTimeout(() => journeyTracker.milestone("w3spay-admin:chain-write", "signing"), 80);
    setTimeout(() => journeyTracker.milestone("w3spay-admin:chain-write", "broadcasting"), 160);
    setTimeout(() => journeyTracker.milestone("w3spay-admin:chain-write", "in-block"), 240);
    setTimeout(() => {
      journeyTracker.complete("w3spay-admin:chain-write", {});
      appendLog("chain-write completed");
    }, 320);
    appendLog("chain-write started");
  };

  const testFailedJourney = () => {
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "set-status" });
    setTimeout(() => journeyTracker.milestone("w3spay-admin:chain-write", "signing"), 80);
    setTimeout(() => {
      journeyTracker.fail("w3spay-admin:chain-write", "user-rejected");
      appendLog("chain-write failed (user-rejected)");
    }, 200);
    appendLog("chain-write started (will fail)");
  };

  const testPrivacyRegression = () => {
    journeyTracker.start("w3spay-admin:chain-write", { "chain.write.op": "register-merchant" });
    // `txHash` matches SENSITIVE_KEY_RE (via the `tx_hash` segment) — the
    // guard refuses the write, logs a console.error, and drops the
    // attribute. The journey continues; the value never reaches Sentry.
    journeyTracker.addAttributes("w3spay-admin:chain-write", {
      txHash: "0x1234567890abcdef1234567890abcdef12345678",
    });
    appendLog("privacy guard: refusal logged to console (attribute dropped)");
    journeyTracker.complete("w3spay-admin:chain-write", {});
  };

  const flushQueue = async () => {
    appendLog("flushing…");
    const ok = await Sentry.flush(2_000);
    appendLog(ok ? "flushed within 2s" : "flush timed out (no DSN?)");
  };

  return (
    <div className="workspace" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Admin telemetry test</h2>
      <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, maxWidth: 480 }}>
        Internal surface gated behind <code>?telemetry-test=1</code>.
        Every button here exercises one edge of the telemetry stack.
        Cross-check the output against your Sentry dashboard's
        Performance / Issues tabs for what actually arrived.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, maxWidth: 320 }}>
        <button type="button" onClick={testError}>Test error (captureError)</button>
        <button type="button" onClick={testBreadcrumb}>Test breadcrumb</button>
        <button type="button" onClick={testSuccessJourney}>Test success journey</button>
        <button type="button" onClick={testFailedJourney}>Test failed journey</button>
        <button type="button" onClick={testPrivacyRegression}>Privacy regression (must refuse)</button>
        <button type="button" onClick={() => void flushQueue()}>Flush queue</button>
      </div>
      <h3 style={{ marginTop: 20, fontSize: 13 }}>Log</h3>
      <pre style={{ fontSize: 11, lineHeight: 1.4, whiteSpace: "pre-wrap", marginTop: 8 }}>
        {log.length === 0 ? "(empty)" : log.join("\n")}
      </pre>
    </div>
  );
}

export function isTelemetryTestRoute(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("telemetry-test") === "1";
}
