// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * One processor group's published Z reports. The on-chain index (seq, CID,
 * size, committed time) is public; the report bodies are AES-encrypted with
 * the group passkey, so viewing requires entering it here. The passkey lives
 * in component state only — deliberately never persisted (mirrors the
 * config editor's unlock flow).
 */
import { useState } from "react";

import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";

import { envConfig } from "@/config";
import { resolveNetwork } from "@shared/chain/host";
import { queryKeys } from "@shared/chain/keys.ts";
import {
  loadProcessorReport,
  processorReportIndexQueryOptions,
  type ProcessorReportLoadResult,
} from "@features/reports/contracts/processor-report-queries.ts";
import { PasskeyInput } from "@features/payment-processors/components/PasskeyInput.tsx";
import { ProcessorReportRow } from "@features/reports/components/ProcessorReportRow.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AGhost, AHead, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export interface ReportsProcessorGroupProps {
  readonly groupId: string;
}

export function ReportsProcessorGroup({ groupId }: ReportsProcessorGroupProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const indexQuery = useQuery(processorReportIndexQueryOptions(groupId));
  const entries = indexQuery.data ?? [];

  const [passkey, setPasskey] = useState("");
  const [show, setShow] = useState(false);
  const [unlockedPasskey, setUnlockedPasskey] = useState<string | null>(null);
  // Bumped on every unlock so a re-unlock (e.g. corrected passkey) refetches
  // rows — the passkey itself never enters a query key.
  const [unlockNonce, setUnlockNonce] = useState(0);

  const gatewayBase = resolveNetwork(envConfig.chain.network).ipfsGateway;
  const locked = unlockedPasskey == null;

  const reportQueries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: queryKeys.processorReport(entry.cid, unlockNonce),
      queryFn: (): Promise<ProcessorReportLoadResult> =>
        loadProcessorReport({ groupId, cid: entry.cid, passkey: unlockedPasskey ?? "", gatewayBase }),
      enabled: !locked,
      // Reports are immutable content-addressed documents.
      staleTime: Infinity,
    })),
  });

  const results = reportQueries.map((q) => q.data);
  const allDecryptFailed =
    entries.length > 0 &&
    results.length === entries.length &&
    results.every((r) => r != null && r.kind === "decrypt-error");

  const backToReports = () =>
    canGoBack ? router.history.back() : navigate({ to: "/reports" });

  return (
    <>
      <AGhost onClick={backToReports}>
        <Icon name="chevron-left" size={14} /> Back to reports
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="Processor reports" title={groupId} size={28} />
      <div style={{ height: 14 }} />

      {locked ? (
        <ACard padding={14}>
          <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.55, marginBottom: 10 }}>
            Reports are encrypted with the group passkey — the same one the processor app unlocks
            with. Enter it to decrypt. It is kept in memory only and never stored.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <PasskeyInput value={passkey} onChange={setPasskey} show={show} onToggle={() => setShow((s) => !s)} />
            </div>
            <ASecondary
              full={false}
              disabled={passkey.length === 0}
              onClick={() => {
                setUnlockedPasskey(passkey);
                setUnlockNonce((n) => n + 1);
              }}
            >
              Unlock reports
            </ASecondary>
          </div>
        </ACard>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: COLOR.muted }}>
            Reports unlocked for this session.
          </span>
          <AGhost onClick={() => setUnlockedPasskey(null)}>Lock</AGhost>
        </div>
      )}

      {allDecryptFailed ? (
        <div style={{ marginTop: 12 }}>
          <ACard padding={14} style={{ borderColor: "rgba(239,68,68,0.30)" }}>
            <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55 }}>
              None of the reports decrypted — wrong passkey for this group?
            </div>
          </ACard>
        </div>
      ) : null}

      <div style={{ height: 14 }} />
      <IndexBody
        loading={indexQuery.isLoading}
        error={indexQuery.isError}
        onRetry={() => void indexQuery.refetch()}
        entries={entries}
        results={results}
        locked={locked}
        gatewayBase={gatewayBase}
      />
    </>
  );
}

function IndexBody({
  loading,
  error,
  onRetry,
  entries,
  results,
  locked,
  gatewayBase,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  entries: ReadonlyArray<{ seq: number; cid: string; size: number; committedAt: string }>;
  results: ReadonlyArray<ProcessorReportLoadResult | undefined>;
  locked: boolean;
  gatewayBase: string;
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: COLOR.muted, fontSize: 12 }}>
        Loading the on-chain report index…
      </div>
    );
  }
  if (error) {
    return (
      <ACard padding={14} style={{ borderColor: "rgba(239,68,68,0.30)" }}>
        <div style={{ fontSize: 12, color: COLOR.redSoft, lineHeight: 1.55, marginBottom: 10 }}>
          Couldn't read the report index from the registry.
        </div>
        <ASecondary full={false} onClick={onRetry}>
          Retry
        </ASecondary>
      </ACard>
    );
  }
  if (entries.length === 0) {
    return (
      <ACard padding={18}>
        <div style={{ fontSize: 13, color: COLOR.muted, lineHeight: 1.5 }}>
          No reports published for this group yet.
        </div>
      </ACard>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((entry, i) => (
        <ProcessorReportRow
          key={entry.seq}
          entry={entry}
          result={results[i]}
          locked={locked}
          gatewayBase={gatewayBase}
        />
      ))}
    </div>
  );
}
