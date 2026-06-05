/**
 * Toast / snackbar — pinned to the bottom of the phone canvas, slides
 * in over the active screen.
 *
 * Ported from `admin-ui.jsx::AToast`. Three tones map to the semantic
 * colour palette: ok (green), warn (amber), err (red).
 */

import { COLOR } from "./tokens.ts";
import { Spinner } from "./Spinner.tsx";

export type ToastTone = "ok" | "warn" | "err";

export interface AToastProps {
  message?: string | null;
  tone?: ToastTone;
  loading?: boolean;
}

const TONE_COLOR: Record<ToastTone, string> = {
  ok: COLOR.green,
  warn: COLOR.amber,
  err: COLOR.red,
};

export function AToast({ message, tone = "ok", loading = false }: AToastProps) {
  if (!message) return null;
  const c = TONE_COLOR[tone];
  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        // Float above the sticky action footer and the home indicator.
        // 88px clears a 50px primary button + ~16px footer padding +
        // safe-area-inset-bottom on devices with a notch.
        bottom: "calc(env(safe-area-inset-bottom) + 88px)",
        background: COLOR.surface,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        animation: "w3-screen-in 220ms cubic-bezier(.2,.7,.2,1)",
        zIndex: 50,
      }}
      role="status"
      aria-live="polite"
    >
      {loading ? (
        <Spinner size={14} color={c} strokeWidth={2.5} label="Transaction pending" />
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: c,
            flex: "0 0 auto",
            boxShadow: `0 0 0 4px ${c}22`,
          }}
        />
      )}
      <span style={{ fontSize: 13, color: COLOR.text2 }}>{message}</span>
    </div>
  );
}
