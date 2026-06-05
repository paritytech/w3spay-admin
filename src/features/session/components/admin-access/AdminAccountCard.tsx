/**
 * Identity card surfaced by the access gate (and by the Account tab) —
 * two copyable rows: the H160 admin grant address (the value the
 * contract owner needs) and the SS58 the user is signed in with.
 */

import { shortenAddress } from "@shared/utils/format.ts";
import { ACard, ADotted, AEye } from "@shared/components/primitives.tsx";
import { AddressBlock } from "./AddressBlock.tsx";
import type { AdminAccountCardProps } from "./types.ts";

export function AdminAccountCard({
  identity,
  title = "Application account",
  compact = false,
}: AdminAccountCardProps) {
  return (
    <ACard padding={compact ? 12 : 16}>
      <AEye>{title}</AEye>
      <AddressBlock
        label="Admin grant H160"
        value={identity.adminH160}
        shortValue={shortenAddress(identity.adminH160)}
        copyLabel="admin-h160"
        copyText="Copy H160"
        primary
      />

      <ADotted margin={compact ? 10 : 12} />

      <AddressBlock
        label={`Product account · ${identity.productIdentifier} · ${identity.derivationIndex}`}
        value={identity.ss58Address}
        shortValue={shortenAddress(identity.ss58Address, 8, 6)}
        copyLabel="ss58"
        copyText="Copy SS58"
      />
    </ACard>
  );
}
