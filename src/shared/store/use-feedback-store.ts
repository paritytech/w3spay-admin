/**
 * Toast + clipboard feedback as a Zustand store.
 *
 * Replaces the old `<FeedbackProvider>` context. Component consumers
 * select the slice they need (`useFeedbackStore((s) => s.copiedField)`,
 * `useFeedbackStore((s) => s.copyValue)`); non-React callers reach the
 * actions through `useFeedbackStore.getState()` — e.g. the pure
 * `showTransactionToast(showToast, …)` helper is invoked with
 * `useFeedbackStore.getState().showToast`.
 *
 * The two debounce timers live as module-level handles (not store
 * state): they are scheduling bookkeeping, not rendered values, and the
 * store is a process singleton so a single pair is correct. Durations
 * mirror the previous provider exactly (2400ms toast, 1500ms copy pill).
 *
 * `<FeedbackToast/>` (src/ui) renders `<AToast/>` from `toast`; mount it
 * once at the app root — there is no provider to wrap children.
 */

import { create } from "zustand";

import type { ToastTone } from "@shared/components/Toast.tsx";

export interface ToastOptions {
  readonly loading?: boolean;
  /** `null` keeps the toast up until explicitly replaced/dismissed. */
  readonly durationMs?: number | null;
}

export interface FeedbackToastState {
  readonly msg: string;
  readonly tone: ToastTone;
  readonly loading: boolean;
}

export interface FeedbackState {
  readonly copiedField: string | null;
  readonly toast: FeedbackToastState | null;
  copyValue(value: string, label: string): void;
  showToast(msg: string, tone?: ToastTone, options?: ToastOptions): void;
  dismissToast(): void;
}

const TOAST_DURATION_MS = 2400;
const COPY_PILL_DURATION_MS = 1500;

// Timer handles are scheduling bookkeeping, not rendered state. The
// `ReturnType<typeof setTimeout>` form is the sanctioned exception for
// timer handles and stays correct in both browser and node test envs.
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;

export const useFeedbackStore = create<FeedbackState>((set) => ({
  copiedField: null,
  toast: null,

  showToast: (msg, tone = "ok", options = {}) => {
    set({ toast: { msg, tone, loading: options.loading === true } });
    if (toastTimer != null) clearTimeout(toastTimer);
    toastTimer = null;
    // A loading toast (spinner) or an explicit `durationMs: null` stays
    // up until the next showToast / dismissToast replaces it.
    if (options.loading === true || options.durationMs === null) return;
    toastTimer = setTimeout(
      () => set({ toast: null }),
      options.durationMs ?? TOAST_DURATION_MS,
    );
  },

  dismissToast: () => {
    if (toastTimer != null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },

  copyValue: (value, label) => {
    try {
      void navigator.clipboard?.writeText(value);
    } catch {
      /* clipboard unavailable in cross-origin / plain-HTTP contexts */
    }
    set({ copiedField: label });
    if (copyTimer != null) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => set({ copiedField: null }), COPY_PILL_DURATION_MS);
  },
}));
