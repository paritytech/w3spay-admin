/**
 * Bulletin envelope contract.
 *
 * The envelope is the source of truth for what we hash into the CID
 * and what T3rminal devices decode after the gateway fetch. Schema
 * mismatch must produce `null` (not throw) so the gateway-fetch path
 * can fall back to "stale registry" UX gracefully.
 */

import { describe, expect, it } from "vitest";

import {
  W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
  W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION,
  buildAndEncodeItemConfigEnvelope,
  decodeItemConfigEnvelope,
} from "@features/items/api/envelope.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

const config: ItemConfig = {
  id: "bar",
  name: "Bar",
  updatedAt: "2026-05-25T10:00:00Z",
  items: [
    { id: "sku-001", name: "Tequila Shot", price: 4 },
    { id: "sku-002", name: "Aperol Spritz", price: 8.5 },
  ],
};

describe("item config envelope", () => {
  it("is versioned and unencrypted", () => {
    const { envelope, bytes } = buildAndEncodeItemConfigEnvelope({
      config,
      publishedAt: "2026-05-26T10:00:00Z",
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    expect(envelope.type).toBe(W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE);
    expect(envelope.v).toBe(W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION);
    // Bytes must be readable JSON — no encryption layer.
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.config.id).toBe("bar");
    expect(json.config.items).toHaveLength(2);
  });

  it("roundtrips through decode", () => {
    const { envelope, bytes } = buildAndEncodeItemConfigEnvelope({
      config,
      publishedAt: "2026-05-26T10:00:00Z",
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    const decoded = decodeItemConfigEnvelope(bytes);
    expect(decoded).toEqual(envelope);
  });

  it("rejects payloads from a future version", () => {
    const future = JSON.stringify({
      type: W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
      v: 99,
      config,
      publishedAt: "2026-05-26T10:00:00Z",
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    expect(decodeItemConfigEnvelope(future)).toBeNull();
  });

  it("rejects payloads with the wrong type tag", () => {
    const wrongType = JSON.stringify({
      type: "not-w3spay",
      v: 1,
      config,
      publishedAt: "2026-05-26T10:00:00Z",
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    expect(decodeItemConfigEnvelope(wrongType)).toBeNull();
  });

  it("rejects payloads missing required fields", () => {
    const missingPublishedAt = JSON.stringify({
      type: W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
      v: 1,
      config,
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    expect(decodeItemConfigEnvelope(missingPublishedAt)).toBeNull();
  });

  it("rejects invalid JSON without throwing", () => {
    expect(decodeItemConfigEnvelope("not-json")).toBeNull();
  });

  it("rejects an envelope with a malformed config body", () => {
    const badConfig = JSON.stringify({
      type: W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
      v: 1,
      config: { id: "bar", name: "Bar", updatedAt: "2026-01-01T00:00:00Z", items: "not-an-array" },
      publishedAt: "2026-05-26T10:00:00Z",
      publishedBy: "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1",
    });
    expect(decodeItemConfigEnvelope(badConfig)).toBeNull();
  });
});
