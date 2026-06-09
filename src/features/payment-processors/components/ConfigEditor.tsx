// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useNavigate } from "@tanstack/react-router";

import {
  ADotted,
  AField,
  AHead,
  APrimary,
  ASecondary,
} from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { COLOR } from "@shared/components/tokens.ts";

import { useConfigEditor } from "../use-config-editor.ts";
import { UnlockGate } from "./UnlockGate.tsx";
import { GroupPicker } from "./GroupPicker.tsx";
import { TerminalPicker } from "./TerminalPicker.tsx";
import { PasskeyInput } from "./PasskeyInput.tsx";
import { ExportPanel } from "./ExportPanel.tsx";
import { ErrorBox } from "./ErrorBox.tsx";

export function ConfigEditor({ initialGroupId }: { initialGroupId: string | null }) {
  const navigate = useNavigate();
  const editor = useConfigEditor(initialGroupId);

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
    </>
  );
}
