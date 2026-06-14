import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchItemConfigEnvelope } from "@features/items/contracts/item-config-storage.ts";
import { buildAndEncodeItemConfigEnvelope } from "@features/items/contracts/envelope.ts";
import { fetchReportEnvelope } from "@features/reports/contracts/fetch-report.ts";
import type { FetchBulletinPreimage } from "@shared/chain/host/bulletin-content.ts";
import type { ItemConfig } from "@features/items/items-model.ts";

const CONFIG: ItemConfig = {
  id: "bar",
  name: "Bar",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  items: [{ id: "espresso", name: "Espresso", price: 2.5, updatedAt: "2026-01-01T00:00:00.000Z" }],
};

const okPreimage = (bytes: Uint8Array): FetchBulletinPreimage => async () => ({ kind: "ok", bytes });
const unavailable: FetchBulletinPreimage = async () => ({ kind: "unavailable", reason: "timed out" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchItemConfigEnvelope (host transport)", () => {
  it("decodes preimage bytes and never reaches an HTTPS gateway", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTPS used"));
    const { bytes } = buildAndEncodeItemConfigEnvelope({
      config: CONFIG,
      publishedAt: "2026-05-26T10:00:00.000Z",
      publishedBy: "addr",
    });

    const envelope = await fetchItemConfigEnvelope({
      cid: "bafk-cid",
      gatewayBase: "https://gw.example",
      fetchPreimage: okPreimage(bytes),
    });

    expect(envelope?.config.id).toBe("bar");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null on an unavailable host preimage without falling back to HTTPS", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTPS used"));

    const envelope = await fetchItemConfigEnvelope({
      cid: "bafk-cid",
      gatewayBase: "https://gw.example",
      fetchPreimage: unavailable,
    });

    expect(envelope).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchReportEnvelope (host transport)", () => {
  it("decodes preimage bytes and never reaches an HTTPS gateway", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("HTTPS used"));
    const bytes = new TextEncoder().encode(JSON.stringify({ v: 99, anything: true }));

    const result = await fetchReportEnvelope({
      cid: "bafk-cid",
      gatewayBase: "https://gw.example",
      fetchPreimage: okPreimage(bytes),
    });

    expect(result.kind).toBe("ok");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a json-error when the host returns non-JSON bytes", async () => {
    const bytes = new TextEncoder().encode("{not json");
    const result = await fetchReportEnvelope({
      cid: "bafk-cid",
      gatewayBase: "https://gw.example",
      fetchPreimage: okPreimage(bytes),
    });
    expect(result.kind).toBe("json-error");
  });

  it("maps an unavailable host preimage to network-error", async () => {
    const result = await fetchReportEnvelope({
      cid: "bafk-cid",
      gatewayBase: "https://gw.example",
      fetchPreimage: unavailable,
    });
    expect(result).toEqual({ kind: "network-error", reason: "timed out" });
  });
});
