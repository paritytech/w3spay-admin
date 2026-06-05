/**
 * Lifecycle action buttons at the bottom of the merchant detail screen.
 * Pause / resume / revoke / reinstate, gated on the current status, plus a
 * permanent delete that removes the registry row entirely (distinct from
 * revoke, which keeps the row in a `revoked` state). Delete is two-tap
 * confirmed because it is irreversible.
 */

import { useState, type CSSProperties } from "react";

import { Icon } from "@shared/components/Icon.tsx";
import { APrimary, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import type { MerchantLifecycle } from "@features/merchant/merchant-model.ts";

export type StatusActionKind = "pause" | "resume" | "revoke" | "reinstate";

export interface StatusActionsProps {
  status: MerchantLifecycle;
  writeInFlight: boolean;
  onSetStatus: (action: StatusActionKind, target: MerchantLifecycle) => void;
  onDelete: () => void;
}

const DESTRUCTIVE_BUTTON: CSSProperties = {
  background: "transparent",
  color: COLOR.redSoft,
  border: "1px solid rgba(239,68,68,0.35)",
  borderRadius: 999,
  padding: "12px 18px",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 500,
  width: "100%",
  minHeight: 46,
};

export function StatusActions({ status, writeInFlight, onSetStatus, onDelete }: StatusActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {status === "active" ? (
        <ASecondary
          onClick={writeInFlight ? undefined : () => onSetStatus("pause", "paused")}
          icon={<Icon name="alert-triangle" size={14} />}
        >
          Pause merchant
        </ASecondary>
      ) : null}
      {status === "paused" ? (
        <ASecondary
          onClick={writeInFlight ? undefined : () => onSetStatus("resume", "active")}
          icon={<Icon name="check" size={14} />}
        >
          Resume merchant
        </ASecondary>
      ) : null}
      {status !== "revoked" ? (
        <button
          type="button"
          disabled={writeInFlight}
          onClick={() => onSetStatus("revoke", "revoked")}
          style={{
            ...DESTRUCTIVE_BUTTON,
            cursor: writeInFlight ? "default" : "pointer",
            opacity: writeInFlight ? 0.6 : 1,
          }}
        >
          Revoke terminal
        </button>
      ) : null}
      {status === "revoked" ? (
        <ASecondary
          onClick={writeInFlight ? undefined : () => onSetStatus("reinstate", "active")}
          icon={<Icon name="refresh-cw" size={14} />}
        >
          Reinstate terminal
        </ASecondary>
      ) : null}

      {confirmingDelete ? (
        <div style={{ display: "flex", gap: 8 }}>
          <ASecondary full={false} onClick={() => setConfirmingDelete(false)}>
            Cancel
          </ASecondary>
          <APrimary
            danger
            full={false}
            disabled={writeInFlight}
            onClick={writeInFlight ? undefined : onDelete}
          >
            Confirm delete
          </APrimary>
        </div>
      ) : (
        <button
          type="button"
          disabled={writeInFlight}
          onClick={() => setConfirmingDelete(true)}
          style={{
            ...DESTRUCTIVE_BUTTON,
            cursor: writeInFlight ? "default" : "pointer",
            opacity: writeInFlight ? 0.6 : 1,
          }}
        >
          <Icon name="trash-2" size={14} /> Delete merchant
        </button>
      )}
    </div>
  );
}
