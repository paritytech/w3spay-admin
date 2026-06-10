// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  ADotted,
  AField,
  AHead,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

import { useConfigEditor } from "../use-config-editor.ts";
import { useProcessorConfigDelete } from "../contracts/processor-config-mutations.ts";
import { UnlockGate } from "./UnlockGate.tsx";
import { GroupPicker } from "./GroupPicker.tsx";
import { TerminalPicker } from "./TerminalPicker.tsx";
import { PasskeyInput } from "./PasskeyInput.tsx";
import { ExportPanel } from "./ExportPanel.tsx";
import { ErrorBox } from "./ErrorBox.tsx";

export function ConfigEditor({ initialGroupId }: { initialGroupId: string | null }) {
  const navigate = useNavigate();
  const editor = useConfigEditor(initialGroupId);
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const { remove, removeInFlight } = useProcessorConfigDelete(readyAccount);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editor.unlock === "checking") {
    return (
      <div style={{ marginTop: 24, color: COLOR.muted, fontSize: 13 }}>
        Checking this device for a cached config…
      </div>
    );
  }
  if (editor.unlock !== "ready") {
    return <UnlockGate editor={editor} />;
  }

  return (
    <>
      <div style={{ height: 6 }} />
      <AHead
        eyebrow={initialGroupId ? "Re-publish config" : "New config"}
        title={initialGroupId ? "Update" : "Publish a"}
        size={30}
      />
      <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.5, marginBottom: 16 }}>
        This config lets an <strong style={{ color: COLOR.text }}>external merchant accept coin payments</strong> through
        their own payment-processor app. Pick the group and its POS terminals, set a group passkey, and publish —
        terminal keys are auto-generated, the bundle is AES-encrypted with the passkey, uploaded to Bulletin by the
        host, and its CID recorded on the registry. Share the group ID + passkey with the merchant out-of-band.
      </div>

      <GroupPicker
        restaurants={editor.restaurantList}
        selectedId={editor.groupId}
        onSelect={editor.selectGroup}
      />

      <ADotted margin={6} />

      <TerminalPicker editor={editor} />

      <ADotted margin={6} />

      {editor.groupId !== "" ? (
        <AField label="Group ID" hint="The merchant's group identifier — also entered at the processor unlock gate.">
          <CopyableRow label="Group ID" value={editor.groupId} mono copyField="signin-group" noBorder />
        </AField>
      ) : null}

      <AField
        label="Group passkey"
        hint="Entered at the processor unlock gate — share out-of-band. Cached on this device after publish or unlock."
      >
        <PasskeyInput
          value={editor.passkey}
          onChange={editor.setPasskey}
          show={editor.showPasskey}
          onToggle={editor.togglePasskey}
        />
      </AField>

      {editor.error ? <ErrorBox message={editor.error} /> : null}

      <div style={{ height: 16 }} />
      <APrimary
        onClick={editor.onPublish}
        disabled={
          editor.publishInFlight ||
          editor.groupId === "" ||
          editor.terminals.length === 0 ||
          editor.passkey === ""
        }
      >
        {editor.publishInFlight ? "Publishing…" : "Encrypt & publish"}
      </APrimary>
      {editor.publishInFlight && editor.txStatus ? (
        <div style={{ marginTop: 10, fontSize: 12, color: COLOR.muted }}>{editor.txStatus}…</div>
      ) : null}
      <div style={{ height: 8 }} />
      <ASecondary onClick={editor.onExport} disabled={editor.terminals.length === 0}>
        Export remote config
      </ASecondary>
      {editor.exportJson ? (
        <ExportPanel
          json={editor.exportJson}
          fileName={`w3spay-remote-config-${editor.groupId || "config"}.json`}
        />
      ) : null}
      <div style={{ height: 8 }} />
      <ASecondary onClick={() => navigate({ to: "/payment-processors" })}>Cancel</ASecondary>
      {initialGroupId != null ? (
        <>
          <ADotted margin={6} />
          {confirmingDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: COLOR.amberSoft, flex: 1 }}>
                Delete this config from the registry? The cached bundle on this device will be cleared.
              </span>
              <ASecondary
                full={false}
                onClick={() => setConfirmingDelete(false)}
                disabled={removeInFlight}
              >
                Cancel
              </ASecondary>
              <button
                type="button"
                disabled={removeInFlight}
                onClick={() => {
                  setConfirmingDelete(false);
                  void remove(initialGroupId).then((result) => {
                    if (result.ok) navigate({ to: "/payment-processors" });
                  });
                }}
                aria-label={`Confirm delete config ${initialGroupId}`}
                style={{
                  background: "#3a1818",
                  color: COLOR.redSoft,
                  border: "1px solid rgba(239,68,68,0.4)",
                  borderRadius: 999,
                  padding: "12px 18px",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: removeInFlight ? "default" : "pointer",
                  opacity: removeInFlight ? 0.6 : 1,
                }}
              >
                Confirm delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={removeInFlight}
              onClick={() => setConfirmingDelete(true)}
              aria-label={`Delete config ${initialGroupId}`}
              style={{
                background: "transparent",
                color: COLOR.redSoft,
                border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 999,
                padding: "12px 18px",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 500,
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: removeInFlight ? "default" : "pointer",
                opacity: removeInFlight ? 0.6 : 1,
              }}
            >
              <Icon name="trash-2" size={14} /> Delete config
            </button>
          )}
        </>
      ) : null}
    </>
  );
}
