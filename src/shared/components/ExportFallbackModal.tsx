// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect } from "react";

import { ASecondary } from "@shared/components/primitives.tsx";
import { COLOR, FONT } from "@shared/components/tokens.ts";
import { useExportFallbackStore } from "@shared/store/use-export-fallback-store.ts";
import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";

const COPY_LABEL = "export-fallback";

/**
 * Shown only when the host shell can't save files (dot.li iframe / iOS webview),
 * where `exportFile` redirects here instead of triggering a download. The content
 * is already on the clipboard; this surfaces it for manual save as a fallback.
 */
export function ExportFallbackModal() {
  const fileName = useExportFallbackStore((s) => s.fileName);
  const content = useExportFallbackStore((s) => s.content);
  const close = useExportFallbackStore((s) => s.close);
  const copyValue = useFeedbackStore((s) => s.copyValue);
  const copied = useFeedbackStore((s) => s.copiedField) === COPY_LABEL;

  useEffect(() => {
    if (fileName == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fileName, close]);

  if (fileName == null || content == null) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Copy ${fileName}`}
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1_000_000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: COLOR.surface,
          border: `1px solid ${COLOR.border}`,
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: COLOR.text }}>{fileName}</div>
        <div style={{ fontSize: 12, color: COLOR.muted, marginTop: 6, lineHeight: 1.5 }}>
          This app shell can&rsquo;t save files directly. The contents are on your clipboard — paste
          them into a file named <span style={{ color: COLOR.text2 }}>{fileName}</span>, or select
          and copy below.
        </div>
        <textarea
          readOnly
          value={content}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            marginTop: 12,
            flex: 1,
            minHeight: 200,
            width: "100%",
            boxSizing: "border-box",
            resize: "none",
            background: COLOR.surface2,
            color: COLOR.text2,
            border: `1px solid ${COLOR.border}`,
            borderRadius: 8,
            padding: 10,
            fontFamily: FONT.mono,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <ASecondary full={false} onClick={() => copyValue(content, COPY_LABEL)}>
            {copied ? "Copied" : "Copy"}
          </ASecondary>
          <ASecondary full={false} onClick={close}>
            Close
          </ASecondary>
        </div>
      </div>
    </div>
  );
}
