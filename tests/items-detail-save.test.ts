import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ItemConfig } from "@features/items/items-model.ts";
import type { PublishedConfigSnapshot } from "@features/items/item-config-drafts.ts";
import { ItemsDetail } from "@features/items/components/ItemsDetail.tsx";

/**
 * The detail view grew an inline "Save & publish" affordance so the
 * operator can publish the config in front of them. It must appear only
 * when the config actually has unsaved changes — otherwise it is noise.
 * These render assertions pin that gating (and the in-flight label).
 */

const CONFIG: ItemConfig = {
  id: "drinks",
  name: "Drinks",
  updatedAt: "2026-01-01T00:00:00.000Z",
  items: [
    { id: "espresso", name: "Espresso", price: 2.5 },
    { id: "negroni", name: "Negroni", price: 9 },
  ],
};

// React escapes the ampersand in the button label when rendering to
// static markup, so the literal to match is the escaped form.
const SAVE_LABEL = "Save &amp; publish changes";

const noop = () => undefined;

function render(
  publishedSnapshot: PublishedConfigSnapshot | null,
  saving = false,
): string {
  return renderToStaticMarkup(
    createElement(ItemsDetail, {
      config: CONFIG,
      publishedSnapshot,
      onBack: noop,
      onCopyId: noop,
      onAddItem: noop,
      onEditItem: noop,
      onDeleteItem: noop,
      onDuplicate: noop,
      onDeleteConfig: noop,
      onSave: noop,
      saving,
    }),
  );
}

function snapshotOf(config: ItemConfig): PublishedConfigSnapshot {
  return {
    configId: config.id,
    cid: "bafyLongCidValueThatTheUiMustTruncate0123456789",
    size: 128,
    updatedAt: config.updatedAt,
    snapshot: config,
  };
}

describe("ItemsDetail save affordance", () => {
  it("offers a save button when the config was never published", () => {
    expect(render(null)).toContain(SAVE_LABEL);
  });

  it("offers a save button when the draft diverges from what is published", () => {
    const stalePublish = snapshotOf({ ...CONFIG, name: "Old name" });
    expect(render(stalePublish)).toContain(SAVE_LABEL);
  });

  it("hides the save button when the draft matches what is published", () => {
    expect(render(snapshotOf(CONFIG))).not.toContain(SAVE_LABEL);
  });

  it("shows the in-flight label while publishing", () => {
    const html = render(null, true);
    expect(html).toContain("Publishing…");
    expect(html).not.toContain(SAVE_LABEL);
  });
});
