// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import { shortAddr, shortTerminalId } from "@features/merchant/merchant-model.ts";
import { ACard, AField, AGhost, AMono, ASecondary } from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR } from "@shared/components/tokens.ts";

import type { ConfigEditorApi } from "../use-config-editor.ts";

export function TerminalPicker({ editor }: { editor: ConfigEditorApi }) {
  const { visibleMerchants, selectedRestaurant } = editor;
  return (
    <AField
      label="Terminals"
      hint="Only POS terminals join a processor config — T3rminal devices get theirs via QR. Topic + key are auto-generated per terminal and saved on this device."
    >
      {visibleMerchants.length === 0 ? (
        <div style={{ fontSize: 12, color: COLOR.faint, lineHeight: 1.5 }}>
          {selectedRestaurant
            ? "No terminals registered under this group's merchant ID."
            : "No terminal registrations found on the registry."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleMerchants.map((m) => (
            <TerminalCard key={m.key} merchant={m} editor={editor} />
          ))}
        </div>
      )}
    </AField>
  );
}

function TerminalCard({ merchant: m, editor }: { merchant: AdminMerchant; editor: ConfigEditorApi }) {
  const isT3r = m.kind === "t3rminal";
  const selected = !isT3r && editor.isSelected(m.terminalId);
  const term = editor.terminals.find((t) => t.terminalId === m.terminalId);
  const generating = editor.generatingId === m.terminalId;

  return (
    <ACard
      padding={12}
      style={{
        ...(selected ? { borderColor: COLOR.blue } : {}),
        ...(isT3r ? { opacity: 0.55 } : {}),
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 8, cursor: isT3r ? "default" : "pointer" }}
        onClick={() => void editor.toggleTerminal(m)}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 9,
                fontFamily: "monospace",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: isT3r ? COLOR.blue : COLOR.muted,
                background: isT3r ? "rgba(96,165,250,0.1)" : "rgba(168,162,158,0.12)",
                borderRadius: 4,
                padding: "1px 5px",
                flexShrink: 0,
              }}
            >
              {isT3r ? "T3r" : "POS"}
            </span>
            <div style={{ color: COLOR.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isT3r ? shortTerminalId(m.terminalId) : m.name}
            </div>
          </div>
          <AMono size={11} color={COLOR.faint}>{shortAddr(m.destinationSs58, 8, 6)}</AMono>
        </div>
        <span style={{ flexShrink: 0 }}>
          {isT3r ? (
            <span style={{ fontSize: 10, color: COLOR.faint }}>via QR</span>
          ) : (
            <Icon name={selected ? "check" : "plus"} size={14} />
          )}
        </span>
      </div>
      {generating ? (
        <div style={{ marginTop: 8, fontSize: 11, color: COLOR.faint }}>Generating keys…</div>
      ) : null}
      {selected && term ? (
        <div style={{ marginTop: 10 }}>
          <CopyableRow
            label="Topic ID"
            value={term.topicId}
            display={shortAddr(term.topicId, 12, 10)}
            mono
            copyField={`topic-${m.terminalId}`}
          />
          <CopyableRow
            label="P-256 key (PEM)"
            value={term.pemFile}
            display="PKCS#8 PEM — tap to copy"
            mono
            copyField={`pem-${m.terminalId}`}
            noBorder
          />
          <div style={{ fontSize: 11, color: COLOR.faint, lineHeight: 1.5, marginTop: 4 }}>
            Auto-generated from the platform CSPRNG, stored on this device, and published inside the
            encrypted bundle.
          </div>
          <RegenerateKeyControl
            disabled={generating}
            onRegenerate={() => void editor.regenerateKey(m.terminalId)}
          />
        </div>
      ) : null}
    </ACard>
  );
}

function RegenerateKeyControl({
  disabled,
  onRegenerate,
}: {
  disabled: boolean;
  onRegenerate: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <div style={{ marginTop: 6 }}>
        <AGhost onClick={() => setConfirm(true)}>Regenerate key…</AGhost>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 200px", fontSize: 11, color: COLOR.redSoft, lineHeight: 1.5 }}>
        Replace this terminal's P-256 key? Publish the config and re-provision the terminal
        (new remote-config export) afterwards — payments encrypted to the old key won't decode.
      </span>
      <AGhost onClick={() => setConfirm(false)}>Cancel</AGhost>
      <ASecondary
        full={false}
        disabled={disabled}
        onClick={() => {
          setConfirm(false);
          onRegenerate();
        }}
      >
        Regenerate key
      </ASecondary>
    </div>
  );
}
