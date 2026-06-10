// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { ACard, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { exportFile } from "@shared/utils/export-file.ts";

/** Remote-config JSON for the current form: terminalId → `{ topic, key, name }`. */
export function ExportPanel({ json, fileName }: { json: string; fileName: string }) {
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const copied = useFeedbackStore((s) => s.copiedField) === "remote-config-json";
  return (
    <ACard padding={12} style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: COLOR.text2, fontWeight: 600 }}>Remote config</span>
        <div style={{ display: "flex", gap: 8 }}>
          <ASecondary
            full={false}
            onClick={() => void exportFile({ fileName, content: json, mimeType: "application/json" })}
          >
            Save JSON
          </ASecondary>
          <ASecondary full={false} onClick={() => copyValue(json, "remote-config-json")}>
            {copied ? "Copied" : "Copy JSON"}
          </ASecondary>
        </div>
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 11,
          fontFamily: FONT.mono,
          color: COLOR.text2,
          overflowX: "auto",
          lineHeight: 1.5,
        }}
      >
        {json}
      </pre>
      <div style={{ fontSize: 11, color: COLOR.faint, marginTop: 8, lineHeight: 1.5 }}>
        Paste into the payer app's remote config. It resolves a scanned terminalId to its topic + key.
        The key is the terminal's compressed PUBLIC key — the private key stays only inside the
        passkey-encrypted bundle.
      </div>
    </ACard>
  );
}
