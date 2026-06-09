// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useMemo, useState } from "react";

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { isH160Address } from "@shared/lib/address.ts";
import { bulkAddAdmins } from "@shared/chain/admin-writes.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { ACard, AEye, AField, ATextarea, APrimary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";

/**
 * Owner-only batch admin grant. Paste one H160 address per line and submit —
 * the registry's `bulkAddAdmins` is idempotent (already-admins are skipped).
 * Non-owners get a friendly message on the contract's `"Not owner"` revert.
 */
export function AdminManagementCard({ account }: { account: ReadyAdminAccount }) {
  const showToast = useFeedbackStore((s) => s.showToast);
  const [text, setText] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = txStatus != null;

  const { valid, invalid } = useMemo(() => {
    const seen = new Set<string>();
    const validAddrs: string[] = [];
    const invalidLines: string[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      if (!isH160Address(line)) {
        invalidLines.push(line);
        continue;
      }
      const lower = line.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        validAddrs.push(lower);
      }
    }
    return { valid: validAddrs, invalid: invalidLines };
  }, [text]);

  const onSubmit = async () => {
    if (invalid.length > 0) {
      setError(`Not valid H160 addresses: ${invalid.join(", ")}`);
      return;
    }
    if (valid.length === 0) {
      setError("Paste at least one 0x-prefixed H160 admin address.");
      return;
    }
    setError(null);
    setTxStatus("preparing");
    try {
      await bulkAddAdmins({
        context: { signer: account.signer, walletAddress: account.ss58Address },
        addresses: valid,
        onStatus: setTxStatus,
      });
      showToast(`Granted admin to ${valid.length} address${valid.length === 1 ? "" : "es"}.`, "ok");
      setText("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(
        /not owner/i.test(message)
          ? "Only the registry owner can add admins."
          : message,
      );
    } finally {
      setTxStatus(null);
    }
  };

  return (
    <ACard padding={16}>
      <AEye>Registry admins</AEye>
      <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.5, margin: "6px 0 12px" }}>
        Grant admin (write access to the registry) to one or more accounts. One H160 address per line.
        Owner-only — already-admin entries are skipped.
      </div>
      <AField label="Admin addresses (H160, one per line)">
        <ATextarea
          value={text}
          onChange={setText}
          placeholder={"0x1234…\n0xabcd…"}
          rows={4}
          mono
        />
      </AField>
      {error ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            border: `1px solid ${COLOR.red}`,
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
            color: COLOR.redSoft,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}
      <APrimary onClick={onSubmit} disabled={submitting || valid.length === 0}>
        {submitting
          ? "Granting…"
          : valid.length > 0
            ? `Add ${valid.length} admin${valid.length === 1 ? "" : "s"}`
            : "Add admins"}
      </APrimary>
      {submitting && txStatus ? (
        <div style={{ marginTop: 10, fontSize: 12, color: COLOR.muted }}>{txStatus}…</div>
      ) : null}
    </ACard>
  );
}
