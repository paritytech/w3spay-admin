/**
 * Payout destination block in the merchant detail screen. Three
 * copyable representations of the same destination — SS58, raw
 * AccountId32, and (when the destination is a left-padded H160) the
 * derived H160 — rendered through the shared `<CopyableRow>` so each
 * line copies the full value on click and truncates with an ellipsis
 * when the address overflows the row.
 */

import { useCanWriteMerchants } from "@features/merchant/api/use-merchant-write-ops.ts";
import { useNavigate } from "@tanstack/react-router";
import { type AdminMerchant } from "@features/merchant/merchant-model.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { ACard, AEye, AGhost } from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { COLOR } from "@shared/components/tokens.ts";

export interface PayoutBlockProps {
  m: AdminMerchant;
}

export function PayoutBlock({ m }: PayoutBlockProps) {
  const canWrite = useCanWriteMerchants();
  const navigate = useNavigate();

  // Revoked merchants can't accept new payments anyway — rotating their
  // destination is meaningless and surfaces a confusing "you can edit
  // this revoked row" affordance. Hide the Edit button for them.
  const canRotate = canWrite && m.status !== "revoked";
  const hasDerivedH160 = m.derivedH160 != null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <AEye>Payout destination</AEye>
        {canRotate ? (
          <AGhost
            onClick={() =>
              navigate({
                to: "/merchants/$merchantKey/edit-destination",
                params: { merchantKey: m.key },
              })
            }
            color={COLOR.text3}
          >
            <Icon name="pencil-line" size={12} /> Edit address
          </AGhost>
        ) : null}
      </div>
      <ACard padding={14} style={{ marginTop: 8 }}>
        <CopyableRow
          label="SS58"
          value={m.destinationSs58}
          mono
          copyField="destination-ss58"
        />
        <CopyableRow
          label="Account hex"
          value={m.destinationAccountId}
          mono
          copyField="destination-hex"
          noBorder={!hasDerivedH160}
        />
        {hasDerivedH160 ? (
          <CopyableRow
            label="Derived H160"
            value={m.derivedH160 as string}
            mono
            copyField="derived-h160"
            noBorder
          />
        ) : null}
      </ACard>
    </>
  );
}
