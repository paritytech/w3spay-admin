/**
 * Merchants tab — registration form for a new terminal.
 *
 * The form accepts an SS58 account, a 0x-prefixed AccountId32 (32
 * bytes), or a revive H160 address as the payout destination. The host
 * normalizes the input to a canonical AccountId32 hex string before
 * calling `registerMerchant` on chain.
 *
 * Owns its own form state — the form clears on mount (each visit is a
 * fresh submission). Uses `useMerchantWriteOps().writes` for the
 * registry write and `useRouter().navigate` for post-submit transition
 * to the new merchant's detail screen.
 */

import { useEffect, useState } from "react";

import { useMerchantWriteOps } from "@features/merchant/api/use-merchant-write-ops.ts";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
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
import type { MerchantForm, MerchantFormErrors, MerchantKind } from "@features/merchant/merchant-model.ts";

/**
 * Default merchant group for the pilot deploy. Pre-filling the field
 * removes a per-registration keystroke; operators can still overwrite
 * it before submission for non-funkhaus merchants. Used for both POS
 * and T3rminal kinds because in this pilot every terminal joins the
 * same merchant group.
 */
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
  const { writes } = useMerchantWriteOps();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const [form, setForm] = useState<MerchantForm>(BLANK_FORM);
  const [errors, setErrors] = useState<MerchantFormErrors>({});

  // Each visit to the new-merchant form starts from a clean slate. The
  // mode dependency clears the form when the user picks a different
  // kind without unmounting.
  useEffect(() => {
    setForm(BLANK_FORM);
    setErrors({});
    writes.resetSubmit();
  }, [mode, writes.resetSubmit]);

  const { submitState, submitMessage } = writes;
  const isT3rminal = mode === "t3rminal";
  const disabled =
    (!isT3rminal && !form.terminalId) ||
    !form.merchantId ||
    !form.destination ||
    submitState === "signing" ||
    submitState === "submitting";

  const onBack = () =>
    canGoBack ? router.history.back() : navigate({ to: "/merchants/new" });
  const onSubmit = () => {
    void writes.registerMerchant(form, setErrors, mode).then((key) => {
      if (key != null) navigate({ to: "/merchants/$merchantKey", params: { merchantKey: key } });
    });
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
            : isT3rminal ? "Register T3rminal" : "Register terminal"}
      </APrimary>
    </>
  );
}
