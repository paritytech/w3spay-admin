import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { detectHostEnvironment } = vi.hoisted(() => ({ detectHostEnvironment: vi.fn() }));
vi.mock("@shared/chain/host-connection.ts", () => ({ detectHostEnvironment }));

const { saveFile } = vi.hoisted(() => ({ saveFile: vi.fn() }));
vi.mock("@shared/utils/download.ts", () => ({ saveFile }));

import { useExportFallbackStore } from "@shared/store/use-export-fallback-store.ts";
import { exportFile } from "@shared/utils/export-file.ts";

const share = vi.fn();
const canShare = vi.fn();
const writeText = vi.fn();
const OPTS = { fileName: "w3spay-z-report-grp-0001.csv", content: "a,b\n1,2", mimeType: "text/csv" };

function stubNavigator(over: Record<string, unknown> = {}): void {
  vi.stubGlobal("navigator", { share, canShare, clipboard: { writeText }, ...over });
}

beforeEach(() => {
  detectHostEnvironment.mockReset().mockReturnValue("standalone");
  saveFile.mockReset();
  share.mockReset().mockResolvedValue(undefined);
  canShare.mockReset().mockReturnValue(true);
  writeText.mockReset().mockResolvedValue(undefined);
  stubNavigator();
  useExportFallbackStore.getState().close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exportFile — native share (iOS/Android host, the PNG-receipt path)", () => {
  it("shares the file as a typed attachment, skipping download and the panel", async () => {
    await exportFile(OPTS);
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]![0] as { files: File[] };
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0]!.name).toBe(OPTS.fileName);
    expect(arg.files[0]!.type).toBe("text/csv");
    expect(saveFile).not.toHaveBeenCalled();
    expect(useExportFallbackStore.getState().fileName).toBeNull();
  });

  it("treats a dismissed share sheet (AbortError) as done — no download, no panel", async () => {
    share.mockRejectedValue(new DOMException("cancel", "AbortError"));
    detectHostEnvironment.mockReturnValue("web-iframe"); // would otherwise hit the panel
    await exportFile(OPTS);
    expect(saveFile).not.toHaveBeenCalled();
    expect(useExportFallbackStore.getState().fileName).toBeNull();
  });
});

describe("exportFile — desktop / standalone download", () => {
  it("downloads via saveFile when sharing is unavailable", async () => {
    stubNavigator({ share: undefined, canShare: undefined });
    await exportFile(OPTS);
    expect(saveFile).toHaveBeenCalledWith(OPTS);
    expect(useExportFallbackStore.getState().fileName).toBeNull();
  });

  it("downloads when the shell can't share the file (canShare → false)", async () => {
    canShare.mockReturnValue(false);
    await exportFile(OPTS);
    expect(share).not.toHaveBeenCalled();
    expect(saveFile).toHaveBeenCalledTimes(1);
  });
});

describe("exportFile — dot.li iframe (no web-share, no allow-downloads)", () => {
  it("copies to clipboard and opens the panel when the shell can't share", async () => {
    canShare.mockReturnValue(false);
    detectHostEnvironment.mockReturnValue("web-iframe");
    await exportFile(OPTS);
    expect(saveFile).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(OPTS.content);
    const state = useExportFallbackStore.getState();
    expect(state.fileName).toBe(OPTS.fileName);
    expect(state.content).toBe(OPTS.content);
  });

  it("falls through to the panel when share throws a non-abort error", async () => {
    share.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    detectHostEnvironment.mockReturnValue("web-iframe");
    await exportFile(OPTS);
    expect(writeText).toHaveBeenCalledWith(OPTS.content);
    expect(useExportFallbackStore.getState().fileName).toBe(OPTS.fileName);
  });
});
