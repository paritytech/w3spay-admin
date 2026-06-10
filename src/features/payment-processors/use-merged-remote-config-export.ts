// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useState } from "react";

import type { ProcessorConfigForm } from "./payment-processor-model.ts";
import { buildMergedRemoteConfigExport } from "./remote-config-export.ts";
import {
  useProcessorConfigCache,
  type CachedProcessorConfig,
} from "./store/use-processor-config-cache.ts";

export interface MergedRemoteConfigExportApi {
  readonly selected: ReadonlySet<string>;
  readonly exportJson: string | null;
  readonly exportFileName: string;
  readonly error: string | null;
  /** True when this device holds the group's decrypted config (cached at publish/unlock). */
  isExportable(groupId: string): boolean;
  toggle(groupId: string): void;
  onExport(): void;
}

function cachedToForm(cached: CachedProcessorConfig): ProcessorConfigForm {
  return {
    groupId: cached.groupId,
    merchantName: cached.merchantName,
    merchantId: cached.merchantId,
    passkey: cached.passkey,
    terminals: cached.terminals,
  };
}

/**
 * Selection + merged remote-config export for the processor list page. The
 * export needs each group's decrypted terminals (topic + PEM), which exist
 * on this device only in the config cache — a group never published or
 * unlocked here must be unlocked in its editor first.
 */
export function useMergedRemoteConfigExport(): MergedRemoteConfigExportApi {
  const cache = useProcessorConfigCache();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (groupId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
    setExportJson(null);
    setError(null);
  };

  const onExport = () => {
    const forms: ProcessorConfigForm[] = [];
    const missing: string[] = [];
    for (const groupId of [...selected].sort()) {
      const cached = cache.getConfig(groupId);
      if (cached == null) missing.push(groupId);
      else forms.push(cachedToForm(cached));
    }
    if (missing.length > 0) {
      setExportJson(null);
      setError(
        `No cached config on this device for: ${missing.join(", ")}. ` +
          "Open each config and unlock it with its group passkey, then export again.",
      );
      return;
    }
    try {
      setExportJson(JSON.stringify(buildMergedRemoteConfigExport(forms), null, 2));
      setError(null);
    } catch (caught) {
      setExportJson(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const exportFileName =
    selected.size === 1
      ? `w3spay-remote-config-${[...selected][0]}.json`
      : "w3spay-remote-config-merged.json";

  return {
    selected,
    exportJson,
    exportFileName,
    error,
    isExportable: (groupId) => cache.getConfig(groupId) != null,
    toggle,
    onExport,
  };
}
