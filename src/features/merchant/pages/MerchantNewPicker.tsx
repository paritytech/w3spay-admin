/**
 * Pre-form selector for the "Register terminal" flow. Splits the path:
 *
 * - **POS** → existing manual entry: free-form `terminalId`, manual
 *   `destination`, optional display name.
 * - **T3rminal** → device-driven: paste (later: scan) the device's
 *   payout address; we derive `terminalId` from it and inherit access
 *   to this merchant's items config.
 *
 * Navigation is router-driven — back returns to `/merchants`, pick
 * advances to `/merchants/new/<mode>`.
 */

import type { ReactNode } from "react";

import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AEye, AGhost, AHead } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import type { MerchantKind } from "@features/merchant/merchant-model.ts";

export function MerchantNewPicker() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const onBack = () => (canGoBack ? router.history.back() : navigate({ to: "/merchants" }));
  const onPick = (mode: MerchantKind) =>
    navigate({ to: "/merchants/new/$mode", params: { mode } });

  return (
    <>
      <AGhost onClick={onBack}>
        <Icon name="chevron-left" size={14} /> Cancel
      </AGhost>
      <div style={{ height: 6 }} />
      <AHead eyebrow="Register" title="Add a new" size={30} />
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
        terminal.
      </div>

      <div style={{ fontSize: 13, color: COLOR.text2, lineHeight: 1.55, marginBottom: 14 }}>
        Pick how this terminal connects to the W3SPay merchant directory.
      </div>

      <PickerCard
        label="POS"
        title="Point-of-sale register"
        description="Manual setup. You assign the terminal a stable handle and provide a payout destination."
        icon={<Icon name="scan" size={20} color={COLOR.text} />}
        onClick={() => onPick("pos")}
      />

      <div style={{ height: 10 }} />

      <PickerCard
        label="T3rminal"
        title="T3rminal device"
        description="The device's own payout address is the identity. Grants access to your items config."
        icon={<Icon name="qr-code" size={20} color={COLOR.text} />}
        onClick={() => onPick("t3rminal")}
      />
    </>
  );
}

function PickerCard({
  label,
  title,
  description,
  icon,
  onClick,
}: {
  label: string;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <ACard onClick={onClick} padding={16}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: 999,
            background: COLOR.surface2,
            color: COLOR.text,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <AEye>{label}</AEye>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: 18,
              letterSpacing: "-0.02em",
              color: COLOR.text,
              marginTop: 4,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 12, color: COLOR.text3, marginTop: 6, lineHeight: 1.55 }}>
            {description}
          </div>
        </div>
        <div style={{ color: COLOR.muted, alignSelf: "center", flexShrink: 0 }}>
          <Icon name="chevron-right" size={16} />
        </div>
      </div>
    </ACard>
  );
}
