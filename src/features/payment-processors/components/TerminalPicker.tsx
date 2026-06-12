// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";

import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import { shortAddr, shortTerminalId } from "@features/merchant/merchant-model.ts";
import { ACard, AField, AMono, ASecondary } from "@shared/components/primitives.tsx";
import { CopyableRow } from "@shared/components/CopyableRow.tsx";
import { Icon } from "@shared/components/Icon.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

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
          <PemKeyField
            pem={term.pemFile}
            copyField={`pem-${m.terminalId}`}
            generating={generating}
            onRegenerate={() => void editor.regenerateKey(m.terminalId)}
          />
        </div>
      ) : null}
    </ACard>
  );
}

function PemKeyField({
  pem,
  copyField,
  generating,
  onRegenerate,
}: {
  pem: string;
  copyField: string;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const [show, setShow] = useState(false);
  const copiedField = useFeedbackStore((s) => s.copiedField);
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const copied = copiedField === copyField;

  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 0",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: COLOR.muted,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          P-256 key (PEM)
        </span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide key" : "View key"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: COLOR.muted,
            fontSize: 11,
            padding: 4,
          }}
        >
          <Icon name={show ? "eye-off" : "eye"} size={14} />
          {show ? "Hide" : "View"}
        </button>
      </div>
      {show ? (
        <div
          onClick={() => copyValue(pem, copyField)}
          role="button"
          tabIndex={0}
          title="Tap to copy"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              copyValue(pem, copyField);
            }
          }}
          style={{
            fontFamily: FONT.mono,
            fontSize: 10.5,
            lineHeight: 1.5,
            color: copied ? COLOR.greenSoft : COLOR.text2,
            background: COLOR.surface2,
            borderRadius: 6,
            padding: 10,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: 160,
            overflow: "auto",
            cursor: "pointer",
            outline: "none",
          }}
        >
          {pem}
        </div>
      ) : null}
      <div style={{ marginTop: 8 }}>
        <ASecondary
          full={false}
          icon={<Icon name="refresh-cw" size={13} />}
          onClick={onRegenerate}
          disabled={generating}
        >
          Regenerate key
        </ASecondary>
      </div>
    </div>
  );
}
