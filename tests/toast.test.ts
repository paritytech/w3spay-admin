import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AToast } from "@shared/components/Toast.tsx";
import {
  showTransactionToast,
  transactionToastMessage,
} from "@shared/utils/transaction-toast.ts";

const IN_FLIGHT_STATUSES = ["preparing", "signing", "broadcasting", "in-block"] as const;

describe("AToast", () => {
  it("renders a live loading spinner for in-flight transaction messages", () => {
    const html = renderToStaticMarkup(
      createElement(AToast, {
        message: "Broadcasting transaction…",
        loading: true,
      }),
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("Broadcasting transaction…");
    expect(html).toContain("Transaction pending");
  });
});

describe("transaction toast lifecycle", () => {
  it.each(IN_FLIGHT_STATUSES)("keeps the toast visible with a spinner for %s", (status) => {
    const showToast = vi.fn();

    showTransactionToast(showToast, status);

    expect(showToast).toHaveBeenCalledWith(
      transactionToastMessage(status),
      "ok",
      { loading: true, durationMs: null },
    );
  });

  it("does not replace the final success/failure toast for terminal statuses", () => {
    const showToast = vi.fn();

    showTransactionToast(showToast, "finalized");
    showTransactionToast(showToast, "error");

    expect(showToast).not.toHaveBeenCalled();
  });
});
