// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useMemo, useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { envConfig } from "@/config";
import { resolveNetwork } from "@shared/chain/host";
import {
  useT3rminalReportIndex,
  type ReportIndexEntry,
  type TerminalReportIndexState,
  type TerminalReportRef,
} from "@features/reports/contracts/report-index-queries.ts";
import {
  decryptedReportQueryOptions,
  type DecryptedReportLoadResult,
} from "@features/reports/contracts/report-queries.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { T3rminalAssignmentV1 } from "@shared/store/t3rminal-assignments.ts";
import { useT3rminalAssignments } from "@shared/store/use-assignments-store.ts";
import { deriveReportPasswordFromPasscode } from "@shared/lib/t3rminal-config-qr.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  AEye,
  AGhost,
  AHead,
  AMono,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { ReportDateRow } from "@features/reports/components/ReportDateRow.tsx";
import { ReportDetailPanel } from "@features/reports/components/ReportDetailPanel.tsx";
import { PasskeyInput } from "@features/payment-processors/components/PasskeyInput.tsx";
import { useTerminalReportPasscodeCache } from "@features/reports/store/use-terminal-report-passcode-cache.ts";

export interface ReportsTerminalProps {
  readonly merchantKey: string;
}

export function ReportsTerminal({ merchantKey }: ReportsTerminalProps) {
  const { merchants } = useMerchants();
  const { assignments } = useT3rminalAssignments();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const merchant = useMemo(
    () => merchants.find((m) => m.key === merchantKey),
    [merchants, merchantKey],
  );
  const assignment = assignments.get(merchantKey) ?? null;

  const reportRef = useMemo<TerminalReportRef | null>(
    () =>
      merchant != null
        ? {
            shopKey: merchant.key.toLowerCase() as `0x${string}`,
            merchantId: merchant.merchantId,
            terminalId: merchant.terminalId,
          }
        : null,
    [merchant],
  );
  const indexState = useT3rminalReportIndex(reportRef);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [passcodeDraft, setPasscodeDraft] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [sessionPasswords, setSessionPasswords] = useState<ReadonlyArray<string>>([]);
  const [unlockNonce, setUnlockNonce] = useState(0);
  const [showUnlock, setShowUnlock] = useState(false);

  const passcodeCache = useTerminalReportPasscodeCache();
  const [autoTried, setAutoTried] = useState(false);

  const handleUnlock = () => {
    const trimmed = passcodeDraft.trim();
    if (trimmed.length === 0) return;
    // Derived-wire-password first (QR-flow), raw phrase second (typed on the
    // terminal). The raw passcode is cached once it decrypts a report (see the
    // persist effect below) so it isn't re-typed on the next visit.
    setSessionPasswords([deriveReportPasswordFromPasscode(trimmed), trimmed]);
    setUnlockNonce((n) => n + 1);
    setShowUnlock(false);
  };

  // An explicit unlock overrides a stale stored assignment; otherwise fall
  // back to the QR-issued password when one is on file.
  const passwords = useMemo<ReadonlyArray<string>>(
    () =>
      sessionPasswords.length > 0
        ? sessionPasswords
        : assignment != null
          ? [assignment.reportPassword]
          : [],
    [sessionPasswords, assignment],
  );

  // If the merchant disappears mid-view (e.g. user removed via another
  // surface), close any open detail so we don't render against stale data.
  useEffect(() => {
    if (merchant == null) setSelectedDate(null);
  }, [merchant]);

  const entries = indexState.kind === "ready" ? indexState.index.entries : [];

  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const reportQueries = useQueries({
    queries: entries.map((entry) =>
      decryptedReportQueryOptions(entry.metadata.cid, passwords, unlockNonce, gatewayBase),
    ),
  });
  const reportResults = reportQueries.map((q) => q.data);
  const anyReady = reportResults.some((r) => r != null && r.kind === "ready");

  // Auto-restore a previously verified passcode — only when no QR assignment
  // is on file (a QR-issued password already unlocks). Fires once after the
  // cache hydrates.
  useEffect(() => {
    if (autoTried || !passcodeCache.hydrated) return;
    setAutoTried(true);
    if (assignment != null) return;
    const cached = passcodeCache.getPasskey(merchantKey);
    if (cached != null && cached.length > 0) {
      setSessionPasswords([deriveReportPasswordFromPasscode(cached), cached]);
      setUnlockNonce((n) => n + 1);
    }
  }, [autoTried, passcodeCache.hydrated, passcodeCache, assignment, merchantKey]);

  // Persist the typed passcode once it actually decrypts a report. QR-unlocked
  // terminals never cache (the assignment is the source of truth).
  const typedPasscode = sessionPasswords.length > 0 ? (sessionPasswords[1] ?? null) : null;
  useEffect(() => {
    if (assignment != null || typedPasscode == null || typedPasscode.length === 0 || !anyReady) return;
    if (passcodeCache.getPasskey(merchantKey) === typedPasscode) return;
    passcodeCache.savePasskey(merchantKey, typedPasscode);
  }, [assignment, typedPasscode, anyReady, passcodeCache, merchantKey]);

  const backToReports = () =>
    canGoBack ? router.history.back() : navigate({ to: "/reports" });

  if (merchant == null) {
    return (
      <>
        <AGhost onClick={backToReports}>
          <Icon name="chevron-left" size={14} /> Back to reports
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          Merchant not found.
        </div>
      </>
    );
  }
  if (merchant.kind !== "t3rminal") {
    return (
      <>
        <AGhost onClick={backToReports}>
          <Icon name="chevron-left" size={14} /> Back to reports
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          {merchant.name} is a POS terminal — only T3rminal devices upload
          daily reports.
        </div>
      </>
    );
  }

  const selectedEntry =
    selectedDate != null
      ? entries.find((entry) => entry.date === selectedDate) ?? null
      : null;

  const indexFailed =
    indexState.kind === "error" || indexState.kind === "config-error";

  return (
    <>
      <AGhost onClick={backToReports}>
        <Icon name="chevron-left" size={14} /> Back to reports
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="T3rminal reports" title={merchant.name} size={28} />
      <Subhead
        merchant={merchant}
        assignment={assignment}
        unlocked={sessionPasswords.length > 0}
      />

      {assignment == null || showUnlock ? (
        <ACard padding={14} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.55, marginBottom: 10 }}>
            Enter the report passcode set in Configure T3rminal.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <PasskeyInput
                value={passcodeDraft}
                onChange={setPasscodeDraft}
                show={showPasscode}
                onToggle={() => setShowPasscode((s) => !s)}
                placeholder="report passcode"
              />
            </div>
            <ASecondary
              full={false}
              disabled={passcodeDraft.trim().length === 0}
              onClick={handleUnlock}
            >
              Unlock
            </ASecondary>
          </div>
        </ACard>
      ) : (
        <div style={{ marginTop: 8 }}>
          <AGhost onClick={() => setShowUnlock(true)}>Unlock with a different passcode</AGhost>
        </div>
      )}

      <div style={{ height: 14 }} />

      {indexFailed ? (
        <IndexError state={indexState} />
      ) : (
        <DaysSegment
          state={indexState}
          entries={entries}
          selectedDate={selectedDate}
          selectedEntry={selectedEntry}
          passwords={passwords}
          results={reportResults}
          unlockNonce={unlockNonce}
          onSelect={(date) => setSelectedDate(date)}
        />
      )}
    </>
  );
}

function Subhead({
  merchant,
  assignment,
  unlocked,
}: {
  merchant: AdminMerchant;
  assignment: T3rminalAssignmentV1 | null;
  unlocked: boolean;
}) {
  return (
    <ACard padding={14} style={{ marginTop: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 11, color: COLOR.muted }}>
          <span style={{ marginRight: 6 }}>terminalKey</span>
          <AMono size={11} color={COLOR.text3} weight={400}>
            {merchant.key.slice(0, 14)}…{merchant.key.slice(-6)}
          </AMono>
        </div>
        {assignment == null && !unlocked ? (
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(245,158,11,0.10)",
              color: COLOR.amberSoft,
              border: `1px solid rgba(245,158,11,0.30)`,
            }}
          >
            No QR
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: 999,
              background: "rgba(34,197,94,0.10)",
              color: COLOR.greenSoft,
              border: `1px solid rgba(34,197,94,0.30)`,
            }}
          >
            {assignment != null ? "QR ready" : "Unlocked"}
          </span>
        )}
      </div>
    </ACard>
  );
}

function DaysSegment({
  state,
  entries,
  selectedDate,
  selectedEntry,
  passwords,
  results,
  unlockNonce,
  onSelect,
}: {
  state: TerminalReportIndexState;
  entries: ReadonlyArray<ReportIndexEntry>;
  selectedDate: string | null;
  selectedEntry: ReportIndexEntry | null;
  passwords: ReadonlyArray<string>;
  results: ReadonlyArray<DecryptedReportLoadResult | undefined>;
  unlockNonce: number;
  onSelect: (date: string | null) => void;
}) {
  return (
    <>
      {selectedEntry ? (
        <>
          <ReportDetailPanel
            entry={selectedEntry}
            passwords={passwords}
            unlockNonce={unlockNonce}
            onClose={() => onSelect(null)}
          />
          <div style={{ height: 14 }} />
        </>
      ) : null}

      <AEye>Saved days</AEye>
      <div style={{ height: 6 }} />

      <DatesBody
        state={state}
        entries={entries}
        results={results}
        locked={passwords.length === 0}
        selectedDate={selectedDate}
        onSelect={onSelect}
      />
    </>
  );
}

function IndexError({
  state,
}: {
  state: TerminalReportIndexState;
}) {
  if (state.kind === "config-error") {
    return (
      <ACard padding={14}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
          Reports index isn't configured: {state.reason}. Set
          <code style={{ margin: "0 4px", color: COLOR.text2 }}>
            VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS
          </code>
          and reload.
        </div>
      </ACard>
    );
  }
  if (state.kind === "error") {
    return (
      <ACard padding={14}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
          Couldn't read the report index: {state.reason}
        </div>
        <div style={{ marginTop: 10 }}>
          <ASecondary onClick={state.refresh}>
            <Icon name="refresh-cw" size={12} /> Retry
          </ASecondary>
        </div>
      </ACard>
    );
  }
  return null;
}

function DatesBody({
  state,
  entries,
  results,
  locked,
  selectedDate,
  onSelect,
}: {
  state: TerminalReportIndexState;
  entries: ReadonlyArray<ReportIndexEntry>;
  results: ReadonlyArray<DecryptedReportLoadResult | undefined>;
  locked: boolean;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: COLOR.muted,
          fontSize: 12,
        }}
      >
        Reading the report index…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <ACard padding={14}>
        <div style={{ color: COLOR.text3, fontSize: 12, lineHeight: 1.55 }}>
          No daily reports stored on chain for this terminal yet. T3rminal
          devices upload at end-of-day; until the device finalizes a day
          under this terminal's registry key, this list stays empty.
        </div>
      </ACard>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {entries.map((entry, i) => (
        <ReportDateRow
          key={entry.date}
          entry={entry}
          result={results[i]}
          locked={locked}
          onClick={() =>
            onSelect(selectedDate === entry.date ? null : entry.date)
          }
        />
      ))}
    </div>
  );
}
