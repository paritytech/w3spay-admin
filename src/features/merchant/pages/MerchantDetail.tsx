// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useDeleteMerchant, useSetMerchantStatus } from "@features/merchant/contracts/merchant-mutations.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import {
  formatIsoDateTime,
  timeAgoFromIso,
  type AdminMerchant,
  type MerchantLifecycle,
} from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ACard,
  AEye,
  AGhost,
  ASecondary,
  AStatus,
} from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { PayoutBlock } from "@features/merchant/components/merchant-detail/PayoutBlock.tsx";
import { StatusActions, type StatusActionKind } from "@features/merchant/components/merchant-detail/StatusActions.tsx";

export type { StatusActionKind } from "@features/merchant/components/merchant-detail/StatusActions.tsx";

export interface MerchantDetailProps {
  m: AdminMerchant | undefined;
  onBack: () => void;
  /**
   * True when the route landed on this screen but the registry hasn't
   * yet surfaced the merchant — e.g. just after a register-tx finalized
   * and we're still waiting for the refresh to propagate. Shows a
   * transient "Loading…" instead of "Merchant not found." so the user
   * doesn't see a flicker of failure during the happy path.
   */
  pendingLookup?: boolean;
}

export function MerchantDetail({ m, onBack, pendingLookup }: MerchantDetailProps) {
  const statusMutation = useSetMerchantStatus();
  const deleteMutation = useDeleteMerchant();
  const showToast = useFeedbackStore((s) => s.showToast);
  const navigate = useNavigate();

  if (!m) {
    return (
      <>
        <AGhost onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          {pendingLookup ? "Loading merchant…" : "Merchant not found."}
        </div>
      </>
    );
  }

  const writeInFlight = statusMutation.isPending || deleteMutation.isPending;

  const onSetStatus = async (action: StatusActionKind, target: MerchantLifecycle) => {
    try {
      await statusMutation.mutateAsync({
        payload: { merchantId: m.merchantId, terminalId: m.terminalId, status: target },
      });
    } catch (caught) {
      showToast(`Status update failed: ${caught instanceof Error ? caught.message : String(caught)}`, "warn");
      return;
    }
    const label =
      action === "pause" ? "Paused"
      : action === "resume" ? "Resumed"
      : action === "revoke" ? "Revoked"
      : "Reinstated";
    showToast(`${label} ${m.name}`, action === "revoke" ? "warn" : "ok");
  };

  const onDelete = async () => {
    try {
      await deleteMutation.mutateAsync({
        payload: { merchantId: m.merchantId, terminalId: m.terminalId },
      });
    } catch (caught) {
      showToast(`Delete failed: ${caught instanceof Error ? caught.message : String(caught)}`, "warn");
      return;
    }
    // Deletion is permanent (row removed, not flagged) — warn tone keeps it distinct from a benign success.
    showToast(`Deleted ${m.name}`, "warn");
    onBack();
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <AGhost onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
        <AStatus status={m.status} size="md" />
      </div>

      <AEye>Merchant</AEye>
      <h1
        style={{
          fontFamily: FONT.serif,
          fontWeight: 400,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          fontSize: 32,
          margin: "6px 0 4px",
        }}
      >
        {m.name}
      </h1>

      <ACard padding={14} style={{ marginTop: 18 }}>
        <AEye>Payment activity</AEye>
        <div style={{ fontSize: 12, color: COLOR.text3, marginTop: 8, lineHeight: 1.5 }}>
          The registry contract does not expose lifetime received CASH, payment
          counts, or last-paid timestamps. Wire a payment aggregate source to
          surface those values here.
        </div>
      </ACard>

      <div style={{ height: 12 }} />

      <AEye>Registration</AEye>
      <ACard padding={14} style={{ marginTop: 8 }}>
        <CopyableRow label="Terminal ID" value={m.terminalId} mono copyField="terminal-id" />
        <CopyableRow label="Merchant ID" value={m.merchantId} mono copyField="merchant-id" />
        <CopyableRow label="Display name" value={m.displayName} copyField="display-name" />
        <CopyableRow
          label="Terminal key"
          value={m.key}
          mono
          copyField="terminal-key"
        />
        <CopyableRow
          label="Registered"
          value={m.createdAt}
          display={formatIsoDateTime(m.createdAt)}
          copyField="created-at"
        />
        <CopyableRow
          label="Last updated"
          value={m.updatedAt}
          display={`${formatIsoDateTime(m.updatedAt)} · ${timeAgoFromIso(m.updatedAt)}`}
          copyField="updated-at"
          noBorder
        />
      </ACard>

      <div style={{ height: 12 }} />

      <PayoutBlock m={m} />

      <div style={{ height: 16 }} />

      {m.kind === "t3rminal" ? (
        <>
          <AEye>Terminal binding</AEye>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ASecondary
              onClick={() =>
                navigate({ to: "/merchants/$merchantKey/configure", params: { merchantKey: m.key } })
              }
              icon={<Icon name="copy" size={13} />}
            >
              Configure T3rminal
            </ASecondary>
            <ASecondary
              onClick={() => navigate({ to: "/reports/$merchantKey", params: { merchantKey: m.key } })}
              icon={<Icon name="info" size={13} />}
            >
              View reports
            </ASecondary>
          </div>
          <div style={{ height: 16 }} />
        </>
      ) : null}

      <AEye>Actions</AEye>
      <StatusActions
        status={m.status}
        writeInFlight={writeInFlight}
        onSetStatus={(action, target) => void onSetStatus(action, target)}
        onDelete={() => void onDelete()}
      />
    </>
  );
}

export function MerchantDetailRoute({ merchantKey }: { merchantKey: string }) {
  const { merchants, refreshMerchantEntries } = useMerchants();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const targetKey = merchantKey.toLowerCase();
  const m = merchants.find((entry) => entry.key.toLowerCase() === targetKey);

  // After registering a terminal we navigate to its computed
  // `terminalKey` before its registry refresh has surfaced. Kick off
  // one more refresh and show a transient loading state instead of the
  // permanent "Merchant not found." message.
  const [retryDone, setRetryDone] = useState(false);
  useEffect(() => {
    setRetryDone(false);
  }, [merchantKey]);
  useEffect(() => {
    if (m != null || retryDone) return;
    let cancelled = false;
    void refreshMerchantEntries().finally(() => {
      if (!cancelled) setRetryDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [m, retryDone, refreshMerchantEntries]);

  return (
    <MerchantDetail
      m={m}
      onBack={() => (canGoBack ? router.history.back() : navigate({ to: "/merchants" }))}
      pendingLookup={m == null && !retryDone}
    />
  );
}
