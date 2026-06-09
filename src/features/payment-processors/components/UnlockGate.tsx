// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useNavigate } from "@tanstack/react-router";

import { AField, AHead, APrimary, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";

import type { ConfigEditorApi } from "../use-config-editor.ts";
import { PasskeyInput } from "./PasskeyInput.tsx";
import { ErrorBox } from "./ErrorBox.tsx";

/** Passkey gate shown when editing a published config this device has never unlocked. */
export function UnlockGate({ editor }: { editor: ConfigEditorApi }) {
  const navigate = useNavigate();
  return (
    <>
      <div style={{ height: 6 }} />
      <AHead eyebrow="Re-publish config" title="Unlock" size={30} />
      <div style={{ fontSize: 12, color: COLOR.muted, lineHeight: 1.5, marginBottom: 16 }}>
        The published config for <span style={{ color: COLOR.text }}>{editor.initialGroupId}</span> is
        the source of truth for its terminal keys. Enter the group passkey to fetch it from Bulletin
        and decrypt it — keys are restored on this device, never regenerated. After one unlock this
        device caches the config, so you won't be asked again.
      </div>
      <AField label="Group passkey">
        <PasskeyInput
          value={editor.passkey}
          onChange={editor.setPasskey}
          show={editor.showPasskey}
          onToggle={editor.togglePasskey}
        />
      </AField>
      {editor.publishedRecordReady ? null : (
        <div style={{ fontSize: 12, color: COLOR.faint, marginBottom: 12 }}>
          Looking up the registry record…
        </div>
      )}
      {editor.error ? <ErrorBox message={editor.error} /> : null}
      <div style={{ height: 12 }} />
      <APrimary
        onClick={editor.onUnlock}
        disabled={editor.unlock === "loading" || editor.passkey === "" || !editor.publishedRecordReady}
      >
        {editor.unlock === "loading" ? "Unlocking…" : "Unlock & load"}
      </APrimary>
      <div style={{ height: 8 }} />
      <ASecondary onClick={() => navigate({ to: "/payment-processors" })}>Cancel</ASecondary>
    </>
  );
}
