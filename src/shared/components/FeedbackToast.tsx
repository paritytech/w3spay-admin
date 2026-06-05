/**
 * Renders the active feedback toast from `use-feedback-store`.
 *
 * Mounted once at the app root (replaces the `<AToast/>` the old
 * `<FeedbackProvider>` rendered inline). Subscribes only to the `toast`
 * slice, so clipboard-copy churn (`copiedField`) never re-renders it.
 */

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { AToast } from "./Toast.tsx";

export function FeedbackToast() {
  const toast = useFeedbackStore((s) => s.toast);
  return (
    <AToast
      message={toast?.msg ?? null}
      tone={toast?.tone ?? "ok"}
      loading={toast?.loading ?? false}
    />
  );
}
