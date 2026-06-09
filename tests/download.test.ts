import { afterEach, describe, expect, it, vi } from "vitest";

import { saveFile } from "@shared/utils/download.ts";

type Globals = typeof globalThis & {
  document?: unknown;
  showSaveFilePicker?: unknown;
};

const g = globalThis as Globals;

interface FakeAnchor {
  href: string;
  download: string;
  rel: string;
  clicked: number;
  appended: boolean;
  removed: boolean;
  click(): void;
  remove(): void;
}

function installFakeDom(): { anchors: FakeAnchor[]; createdUrls: string[]; revokedUrls: string[] } {
  const anchors: FakeAnchor[] = [];
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];

  g.document = {
    createElement: (tag: string) => {
      if (tag !== "a") throw new Error(`unexpected element ${tag}`);
      const anchor: FakeAnchor = {
        href: "",
        download: "",
        rel: "",
        clicked: 0,
        appended: false,
        removed: false,
        click() {
          this.clicked += 1;
        },
        remove() {
          this.removed = true;
        },
      };
      anchors.push(anchor);
      return anchor;
    },
    body: {
      appendChild: (el: FakeAnchor) => {
        el.appended = true;
      },
    },
  };

  // Blob is available in Node 18+, but URL.createObjectURL is not — stub it.
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob) => {
    const id = `blob:fake/${createdUrls.length}`;
    createdUrls.push(id);
    // Stash the blob type so tests can assert the forced-download MIME.
    (lastBlob as { value?: Blob }).value = blob;
    return id;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    revokedUrls.push(url);
  });

  return { anchors, createdUrls, revokedUrls };
}

const lastBlob: { value?: Blob } = {};

afterEach(() => {
  delete g.document;
  delete g.showSaveFilePicker;
  lastBlob.value = undefined;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("saveFile — native save dialog (File System Access API)", () => {
  it("writes content through showSaveFilePicker and skips the anchor fallback", async () => {
    const dom = installFakeDom();
    const written: string[] = [];
    const close = vi.fn(async () => {});
    const createWritable = vi.fn(async () => ({
      write: async (data: string) => {
        written.push(data);
      },
      close,
    }));
    const picker = vi.fn(async () => ({ createWritable }));
    g.showSaveFilePicker = picker;

    await saveFile({ fileName: "report.json", content: "{\"a\":1}", mimeType: "application/json" });

    expect(picker).toHaveBeenCalledTimes(1);
    const opts = picker.mock.calls[0]![0] as {
      suggestedName?: string;
      types?: ReadonlyArray<{ accept: Record<string, string[]> }>;
    };
    expect(opts.suggestedName).toBe("report.json");
    expect(opts.types?.[0]?.accept).toEqual({ "application/json": [".json"] });
    expect(written).toEqual(["{\"a\":1}"]);
    expect(close).toHaveBeenCalledTimes(1);
    // No anchor download when the native dialog succeeds.
    expect(dom.anchors).toHaveLength(0);
    expect(dom.createdUrls).toHaveLength(0);
  });

  it("treats a user-cancelled dialog (AbortError) as a no-op, not a fallback", async () => {
    const dom = installFakeDom();
    const abort = Object.assign(new Error("the user aborted a request"), { name: "AbortError" });
    g.showSaveFilePicker = vi.fn(async () => {
      throw abort;
    });

    await saveFile({ fileName: "report.json", content: "{}" });

    expect(dom.anchors).toHaveLength(0);
    expect(dom.createdUrls).toHaveLength(0);
  });

  it("falls back to the anchor download when the picker fails for a non-cancel reason", async () => {
    const dom = installFakeDom();
    g.showSaveFilePicker = vi.fn(async () => {
      throw new Error("not allowed in this context");
    });

    await saveFile({ fileName: "report.json", content: "{}" });

    expect(dom.anchors).toHaveLength(1);
    expect(dom.anchors[0]!.download).toBe("report.json");
  });
});

describe("saveFile — anchor fallback (no File System Access API)", () => {
  it("forces a download via octet-stream, DOM-attaches the anchor, and revokes on a delay", async () => {
    vi.useFakeTimers();
    const dom = installFakeDom();
    // No showSaveFilePicker installed → fallback path.

    await saveFile({ fileName: "daily-report-2026-06-10.json", content: "PAYLOAD" });

    expect(dom.anchors).toHaveLength(1);
    const a = dom.anchors[0]!;
    expect(a.download).toBe("daily-report-2026-06-10.json");
    expect(a.rel).toBe("noopener");
    expect(a.appended).toBe(true);
    expect(a.clicked).toBe(1);
    expect(a.removed).toBe(true);

    // The blob must be octet-stream so webviews don't render it inline as a preview.
    expect(lastBlob.value?.type).toBe("application/octet-stream");

    // URL is created immediately but revoked only after a delay so the click can land.
    expect(dom.createdUrls).toHaveLength(1);
    expect(dom.revokedUrls).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(dom.revokedUrls).toEqual(dom.createdUrls);
  });

  it("no-ops when there is no document (non-browser environment)", async () => {
    // document intentionally not installed.
    await expect(saveFile({ fileName: "x.json", content: "{}" })).resolves.toBeUndefined();
  });
});
