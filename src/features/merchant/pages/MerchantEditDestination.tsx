// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useState } from "react";

import { useSetMerchantDestination } from "@features/merchant/contracts/merchant-mutations.ts";
import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { TxStatus } from "@/shared/chain/contracts";
import { transactionToastMessage } from "@shared/utils/transaction-toast.ts";
import { normalizeMerchantDestinationInput, type AccountId32Hex } from "@shared/lib/address.ts";
import { type AdminMerchant, shortAddr } from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ADotted,
  AField,
  AGhost,
  AHead,
  APrimary,
  ATextarea,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";

export interface MerchantEditDestinationProps {
  m: AdminMerchant | undefined;
}

export function MerchantEditDestination({ m }: MerchantEditDestinationProps) {
  const rotateDestination = useSetMerchantDestination();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const [destination, setDestination] = useState<string>(() => m?.destinationSs58 ?? "");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);

  const resetMutation = rotateDestination.reset;
  useEffect(() => {
    setDestination(m?.destinationSs58 ?? "");
    setError(null);
    setTxStatus(null);
    resetMutation();
  }, [m?.key, m?.destinationSs58, resetMutation]);

  if (m == null) {
    return (
      <>
        <AGhost onClick={() => (canGoBack ? router.history.back() : navigate({ to: "/merchants" }))}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
        <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
          Merchant not found.
        </div>
      </>
    );
  }

  const busy = rotateDestination.isPending;
  const trimmed = destination.trim();
  const disabled = trimmed === "" || busy;
  const submitError = rotateDestination.error;
  const statusMessage =
    submitError != null
      ? submitError.message
      : txStatus != null
        ? transactionToastMessage(txStatus)
        : null;

  const onBack = () =>
    canGoBack
      ? router.history.back()
      : navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } });

  const onSubmit = async () => {
    let destinationAccountId: AccountId32Hex;
    try {
      destinationAccountId = normalizeMerchantDestinationInput(trimmed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    if (destinationAccountId.toLowerCase() === m.destinationAccountId.toLowerCase()) {
      setError("That's already the current destination.");
      return;
    }
    setError(null);
    setTxStatus("preparing");
    try {
      await rotateDestination.mutateAsync({
        payload: { merchantId: m.merchantId, terminalId: m.terminalId, destinationAccountId },
        onStatus: setTxStatus,
      });
    } catch {
      // Surfaced via rotateDestination.error.
      return;
    } finally {
      setTxStatus(null);
    }
    navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } });
  };

  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead
        eyebrow="Rotate destination"
        title="Edit the payout"
        size={30}
      />
      <div
        style={{
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 30,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: COLOR.text3,
          marginTop: -4,
          marginBottom: 16,
        }}
      >
        address.
      </div>

      <div style={{ fontSize: 12, color: COLOR.text3, lineHeight: 1.55, marginBottom: 12 }}>
        Updating the destination changes where W3SPay payments land for
        <span style={{ color: COLOR.text2 }}> {m.name}</span>. Display name and
        lifecycle status stay as they are.
      </div>

      <AField
        label="Current destination"
        hint="Read-only. Verify you're rotating the right terminal before you paste a new one."
      >
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 11.5,
            color: COLOR.text3,
            wordBreak: "break-all",
            lineHeight: 1.55,
            padding: "8px 10px",
            background: COLOR.surface,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 10,
          }}
        >
          {m.destinationSs58}
          <div style={{ marginTop: 4, color: COLOR.muted, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Raw · {shortAddr(m.destinationAccountId)}
          </div>
        </div>
      </AField>

      <AField
        label="New destination"
        hint="Accepts SS58, AccountId32 hex, or H160. Normalized to AccountId32 on chain."
        error={error ?? undefined}
      >
        <ATextarea
          value={destination}
          onChange={(v) => {
            setDestination(v);
            if (error) setError(null);
          }}
          placeholder="5Gh1xK8Qmf2cN6oTzVbW9pLrJ7qFAUyT3DnPxEMr8wnwQ7s8"
          mono
          rows={3}
        />
      </AField>
      <ADotted margin={6} />

      <div
        style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.28)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginTop: 10,
        }}
      >
        <span style={{ color: COLOR.amber, marginTop: 1 }}>
          <Icon name="shield-check" size={14} />
        </span>
        <div style={{ fontSize: 12, color: COLOR.text2, lineHeight: 1.5 }}>
          Future payments for this terminal will route to the new
          destination. Past payments are unaffected. Verify the new
          address belongs to the merchant before you submit.
        </div>
      </div>

      {statusMessage ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            border: `1px solid ${submitError != null ? COLOR.red : COLOR.border}`,
            borderRadius: 12,
            background: submitError != null ? "rgba(239,68,68,0.08)" : COLOR.surface,
            color: submitError != null ? COLOR.redSoft : COLOR.text2,
            fontSize: 12,
          }}
        >
          {statusMessage}
        </div>
      ) : null}

      <div style={{ height: 18 }} />
      <APrimary onClick={() => void onSubmit()} disabled={disabled}>
        {txStatus === "preparing" || txStatus === "signing"
          ? "Sign in your wallet…"
          : busy
            ? "Submitting…"
            : "Rotate destination"}
      </APrimary>
    </>
  );
}

export function MerchantEditDestinationRoute({ merchantKey }: { merchantKey: string }) {
  const { merchants } = useMerchants();
  const targetKey = merchantKey.toLowerCase();
  const m = merchants.find((entry) => entry.key.toLowerCase() === targetKey);
  return <MerchantEditDestination m={m} />;
}
