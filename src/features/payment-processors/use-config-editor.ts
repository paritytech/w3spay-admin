// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import type { ConfigEditorApi, UnlockState } from "./config-editor-api.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";
import { useRestaurants } from "@features/restaurants/contracts/use-restaurants.ts";
import { useMerchants } from "@features/merchant/contracts/use-merchants.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";

import {
  bundleToForm,
  validateProcessorForm,
  type ProcessorConfigForm,
  type ProcessorTerminalForm,
} from "./payment-processor-model.ts";
import { buildRemoteConfigExport } from "./remote-config-export.ts";
import { generateP256PrivateKeyPem, generateTerminalSecret } from "./secret-generation.ts";
import { useTerminalSecrets } from "./store/use-terminal-secrets-store.ts";
import { useProcessorConfigCache } from "./store/use-processor-config-cache.ts";
import { processorConfigRegistryQueryOptions } from "./contracts/processor-config-queries.ts";
import { useProcessorConfigPublish } from "./contracts/processor-config-mutations.ts";
import { loadPublishedProcessorConfig } from "./contracts/processor-config-load.ts";

export type { ConfigEditorApi, UnlockState } from "./config-editor-api.ts";

export function useConfigEditor(initialGroupId: string | null): ConfigEditorApi {
  const navigate = useNavigate();
  const restaurants = useRestaurants();
  const { merchants } = useMerchants();
  const secrets = useTerminalSecrets();
  const cache = useProcessorConfigCache();
  const readyAccount = useSessionStore((s) => s.readyAccount);
  const { publish, publishInFlight, txStatus } = useProcessorConfigPublish(readyAccount);
  const registryQuery = useQuery(processorConfigRegistryQueryOptions());

  const [groupId, setGroupId] = useState<string>(initialGroupId ?? "");
  const [terminals, setTerminals] = useState<ProcessorTerminalForm[]>([]);
  const [passkey, setPasskeyState] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Edit first checks the local cache; only a device that has never seen the
  // config falls back to the passkey gate (decrypt the published bundle so
  // existing terminal keys are restored, never regenerated).
  const [unlock, setUnlock] = useState<UnlockState>(
    initialGroupId != null && !isDemoMode() ? "checking" : "ready",
  );
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [showPasskey, setShowPasskey] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);

  useEffect(() => {
    if (unlock !== "checking" || !cache.hydrated) return;
    const cached = initialGroupId != null ? cache.getConfig(initialGroupId) : null;
    if (cached != null) {
      setTerminals(cached.terminals);
      setPasskeyState(cached.passkey);
      setUnlock("ready");
    } else {
      setUnlock("locked");
    }
  }, [unlock, cache, initialGroupId]);

  const restaurantList = useMemo(() => {
    const list = Array.from(restaurants.restaurants.values());
    list.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    return list;
  }, [restaurants.restaurants]);

  const selectedRestaurant = groupId !== "" ? restaurants.getRestaurant(groupId) : null;

  // Scope the terminal list to the selected group's merchantId.
  const visibleMerchants = useMemo(
    () =>
      selectedRestaurant
        ? merchants.filter((m) => m.merchantId === selectedRestaurant.merchantId)
        : merchants,
    [merchants, selectedRestaurant],
  );

  const publishedRecord = useMemo(
    () =>
      initialGroupId
        ? ((registryQuery.data ?? []).find((r) => r.groupId === initialGroupId) ?? null)
        : null,
    [registryQuery.data, initialGroupId],
  );

  const formForGroup = (): ProcessorConfigForm | null =>
    selectedRestaurant == null
      ? null
      : {
          groupId,
          merchantName: selectedRestaurant.profile.name,
          merchantId: selectedRestaurant.merchantId,
          terminals,
          passkey,
        };

  const saveToCache = (form: ProcessorConfigForm) => {
    cache.saveConfig({
      groupId: form.groupId,
      merchantName: form.merchantName,
      merchantId: form.merchantId,
      passkey: form.passkey,
      terminals: form.terminals,
      cachedAt: new Date().toISOString(),
    });
  };

  const onUnlock = async () => {
    if (initialGroupId == null || publishedRecord == null) return;
    setUnlock("loading");
    setError(null);
    try {
      const bundle = await loadPublishedProcessorConfig({
        groupId: initialGroupId,
        cid: publishedRecord.cid,
        passkey,
      });
      const form = bundleToForm(bundle, passkey);
      setTerminals(form.terminals);
      for (const t of form.terminals) {
        secrets.saveSecret(t.terminalId, { topicId: t.topicId, pemFile: t.pemFile });
      }
      saveToCache(form);
      setUnlock("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setUnlock("locked");
    }
  };

  const toggleTerminal = async (m: AdminMerchant) => {
    // T3rminal devices get their config via QR — never part of a processor config.
    if (m.kind !== "pos") return;
    // Don't generate before the saved-secrets store hydrates — it would orphan existing keys.
    if (!secrets.hydrated || generatingId != null) return;
    setError(null);
    setExportJson(null);
    if (terminals.some((t) => t.terminalId === m.terminalId)) {
      setTerminals((prev) => prev.filter((t) => t.terminalId !== m.terminalId));
      return;
    }
    let secret = secrets.getSecret(m.terminalId);
    if (secret == null) {
      setGeneratingId(m.terminalId);
      try {
        secret = await generateTerminalSecret();
        secrets.saveSecret(m.terminalId, secret);
      } finally {
        setGeneratingId(null);
      }
    }
    const resolved = secret;
    setTerminals((prev) =>
      prev.some((t) => t.terminalId === m.terminalId)
        ? prev
        : [
            ...prev,
            {
              terminalId: m.terminalId,
              label: m.name,
              payoutAddress: m.destinationSs58,
              topicId: resolved.topicId,
              pemFile: resolved.pemFile,
            },
          ],
    );
  };

  const regenerateKey = async (terminalId: string) => {
    if (!secrets.hydrated || generatingId != null) return;
    const existing = terminals.find((t) => t.terminalId === terminalId);
    if (existing == null) return;
    setError(null);
    // The remote-config export embeds the public key — stale after rotation.
    setExportJson(null);
    setGeneratingId(terminalId);
    try {
      const pemFile = await generateP256PrivateKeyPem();
      secrets.saveSecret(terminalId, { topicId: existing.topicId.trim().toLowerCase(), pemFile });
      setTerminals((prev) => prev.map((t) => (t.terminalId === terminalId ? { ...t, pemFile } : t)));
    } finally {
      setGeneratingId(null);
    }
  };

  const onPublish = async () => {
    const form = formForGroup();
    if (form == null) {
      setError("Select a restaurant/group.");
      return;
    }
    setError(null);
    for (const t of terminals) {
      secrets.saveSecret(t.terminalId, { topicId: t.topicId.trim().toLowerCase(), pemFile: t.pemFile });
    }
    const result = await publish(form);
    if (result.ok) {
      saveToCache(form);
      navigate({ to: "/payment-processors" });
    } else {
      setError(result.reason);
    }
  };

  const onExport = () => {
    const form = formForGroup();
    if (form == null) {
      setError("Select a restaurant/group.");
      return;
    }
    const validationError = validateProcessorForm(form);
    if (validationError != null) {
      setError(validationError);
      setExportJson(null);
      return;
    }
    setError(null);
    setExportJson(JSON.stringify(buildRemoteConfigExport(form), null, 2));
  };

  return {
    unlock,
    groupId,
    initialGroupId,
    terminals,
    passkey,
    error,
    generatingId,
    showPasskey,
    exportJson,
    publishInFlight,
    txStatus,
    restaurantList,
    selectedRestaurant,
    visibleMerchants,
    publishedRecordReady: publishedRecord != null,
    setPasskey: (value) => {
      setPasskeyState(value);
      setError(null);
    },
    togglePasskey: () => setShowPasskey((s) => !s),
    selectGroup: (r) => {
      setGroupId(r.id);
      setError(null);
      setExportJson(null);
      // Drop selected terminals outside the new group's merchantId.
      setTerminals((prev) =>
        prev.filter((t) =>
          merchants.some((m) => m.terminalId === t.terminalId && m.merchantId === r.merchantId),
        ),
      );
    },
    isSelected: (terminalId) => terminals.some((t) => t.terminalId === terminalId),
    toggleTerminal,
    regenerateKey,
    onUnlock,
    onPublish,
    onExport,
  };
}
