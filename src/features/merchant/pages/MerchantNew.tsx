// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useState } from "react";

import { useRegisterMerchant } from "@features/merchant/contracts/merchant-mutations.ts";
import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import type { TxStatus } from "@/shared/chain/contracts";
import { transactionToastMessage } from "@shared/utils/transaction-toast.ts";
import { Icon } from "@shared/components/Icon.tsx";
import {
  ADotted,
  AField,
  AGhost,
  AHead,
  AInput,
  APrimary,
  ATextarea,
} from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import {
  buildRegisterMerchant,
  type MerchantForm,
  type MerchantFormErrors,
  type MerchantKind,
} from "@features/merchant/merchant-model.ts";

const DEFAULT_MERCHANT_ID = "funkhaus";

const BLANK_FORM: MerchantForm = {
  terminalId: "",
  merchantId: DEFAULT_MERCHANT_ID,
  displayName: "",
  destination: "",
};

export interface MerchantNewProps {
  mode: MerchantKind;
}

export function MerchantNew({ mode }: MerchantNewProps) {
  const registerMerchant = useRegisterMerchant();
  const { merchants } = useMerchants();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const [form, setForm] = useState<MerchantForm>(BLANK_FORM);
  const [errors, setErrors] = useState<MerchantFormErrors>({});
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);

  const resetMutation = registerMerchant.reset;
  // The mode dependency clears the form when the user switches kind without unmounting.
  useEffect(() => {
    setForm(BLANK_FORM);
    setErrors({});
    setTxStatus(null);
    resetMutation();
  }, [mode, resetMutation]);

  const busy = registerMerchant.isPending;
  const isT3rminal = mode === "t3rminal";
  const disabled =
    (!isT3rminal && !form.terminalId) ||
    !form.merchantId ||
    !form.destination ||
    busy;

  const submitError = registerMerchant.error;
  const statusMessage =
    submitError != null
      ? submitError.message
      : txStatus != null
        ? transactionToastMessage(txStatus)
        : null;

  const onBack = () =>
    canGoBack ? router.history.back() : navigate({ to: "/merchants/new" });

  const onSubmit = async () => {
    const input = buildRegisterMerchant(form, merchants, mode);
    if (!input.ok) {
      setErrors(input.errors);
      return;
    }
    setErrors({});
    setTxStatus("preparing");
    try {
      await registerMerchant.mutateAsync({ payload: input.payload, onStatus: setTxStatus });
    } catch {
      // Surfaced via registerMerchant.error.
      return;
    } finally {
      setTxStatus(null);
    }
    navigate({ to: "/merchants/$merchantKey", params: { merchantKey: input.terminalKey } });
  };

  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead
        eyebrow={isT3rminal ? "Register T3rminal" : "Register merchant"}
        title="Add a new"
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
        {isT3rminal ? "T3rminal." : "terminal."}
      </div>

      <AField
        label="Display name"
        hint={
          isT3rminal
            ? "Optional. Defaults to “T3rminal · 0x…” if left blank."
            : "Optional. Shown in the admin directory and on receipts."
        }
      >
        <AInput
          autoFocus
          value={form.displayName}
          onChange={(v) => setForm({ ...form, displayName: v })}
          placeholder={isT3rminal ? "Front counter" : "Bar East (Funkhaus)"}
        />
      </AField>

      {isT3rminal ? (
        <AField label="Merchant ID" error={errors.merchantId} hint="Which merchant group this T3rminal joins.">
          <AInput
            value={form.merchantId}
            onChange={(v) => setForm({ ...form, merchantId: v })}
            placeholder="funkhaus"
            mono
          />
        </AField>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <AField label="Terminal ID" error={errors.terminalId}>
            <AInput
              value={form.terminalId}
              onChange={(v) => setForm({ ...form, terminalId: v })}
              placeholder="bar-east-01"
              mono
            />
          </AField>
          <AField label="Merchant ID" error={errors.merchantId}>
            <AInput
              value={form.merchantId}
              onChange={(v) => setForm({ ...form, merchantId: v })}
              placeholder="funkhaus"
              mono
            />
          </AField>
        </div>
      )}

      <AField
        label={isT3rminal ? "T3rminal address" : "Payout destination"}
        hint={
          isT3rminal
            ? "Paste the device's payout address. Scanning a QR will be wired in a follow-up. Accepts SS58, AccountId32 hex, or H160. The terminalId is derived from this."
            : "Accepts an SS58 account, a 32-byte AccountId32 hex, or a revive H160. Normalized to AccountId32 on chain."
        }
        error={errors.destination}
      >
        <ATextarea
          value={form.destination}
          onChange={(v) => setForm({ ...form, destination: v.trim() })}
          placeholder="5Gh1xK8Qmf2cN6oTzVbW9pLrJ7qFAUyT3DnPxEMr8wnwQ7s8"
          mono
          rows={3}
        />
      </AField>
      <ADotted margin={6} />

      <div
        style={{
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.22)",
          borderRadius: 12,
          padding: "12px 14px",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          marginTop: 10,
        }}
      >
        <span style={{ color: COLOR.green, marginTop: 1 }}>
          <Icon name="shield-check" size={14} />
        </span>
        <div style={{ fontSize: 12, color: COLOR.text2, lineHeight: 1.5 }}>
          {isT3rminal ? (
            <>
              Submitting registers this T3rminal in the W3SPay directory. The
              device inherits access to this merchant's items config and may
              receive payments immediately. Pause or revoke it from the
              merchant page.
            </>
          ) : (
            <>
              Submitting writes a new row to the W3SPay registry on chain. The
              terminal starts as <strong>active</strong> and may receive payments
              immediately. Pause or revoke it from the merchant page.
            </>
          )}
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
            : isT3rminal ? "Register T3rminal" : "Register terminal"}
      </APrimary>
    </>
  );
}
