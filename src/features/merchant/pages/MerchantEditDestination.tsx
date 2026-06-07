/**
 * Merchants tab — rotate the payout destination for an existing terminal.
 *
 * Touches ONLY the on-chain `destinationAccountId`. Display name and
 * lifecycle status are preserved by the dedicated `setMerchantDestination`
 * contract function. Cancelling navigates back to the merchant detail
 * view; submitting drives the write and, on success, returns there too.
 *
 * Form state is local — each visit is a fresh edit. The screen pre-fills
 * the destination field with the current SS58 so the admin can spot the
 * delta before submitting; pasting any of {SS58, AccountId32 hex, H160}
 * is accepted (same normalisation rules as `MerchantNew`).
 */

import { useEffect, useState } from "react";

import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useMerchantWriteOps } from "@features/merchant/contracts/use-merchant-write-ops.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
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
  const { writes } = useMerchantWriteOps();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // Pre-fill with the canonical SS58 so the admin can see at a glance
  // what they're replacing. They can paste any supported format over it.
  const [destination, setDestination] = useState<string>(() => m?.destinationSs58 ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset whenever a different merchant arrives via the route.
    setDestination(m?.destinationSs58 ?? "");
    setError(null);
    writes.resetSubmit();
  }, [m?.key, m?.destinationSs58, writes.resetSubmit]);

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

  const { submitState, submitMessage } = writes;
  const inFlight = submitState === "signing" || submitState === "submitting";
  const trimmed = destination.trim();
  const disabled = trimmed === "" || inFlight;

  const onBack = () =>
    canGoBack
      ? router.history.back()
      : navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } });

  const onSubmit = () => {
    void writes.setMerchantDestination(m, destination, setError).then((ok) => {
      if (ok) navigate({ to: "/merchants/$merchantKey", params: { merchantKey: m.key } });
    });
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

      {submitMessage ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            border: `1px solid ${submitState === "error" ? COLOR.red : COLOR.border}`,
            borderRadius: 12,
            background: submitState === "error" ? "rgba(239,68,68,0.08)" : COLOR.surface,
            color: submitState === "error" ? COLOR.redSoft : COLOR.text2,
            fontSize: 12,
          }}
        >
          {submitMessage}
        </div>
      ) : null}

      <div style={{ height: 18 }} />
      <APrimary onClick={onSubmit} disabled={disabled}>
        {submitState === "signing"
          ? "Sign in your wallet…"
          : submitState === "submitting"
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
