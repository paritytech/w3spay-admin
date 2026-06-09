// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useEffect } from "react";
import { create } from "zustand";

import { cachedAdminKvStore, getAdminKvStore } from "@shared/store/admin-kv.ts";

/**
 * Per-terminal v2 secrets the operator reuses when re-publishing a processor
 * config: the on-wire topicId and the terminal's P-256 private-key PEM.
 *
 * These live ONLY in the operator's host KV (`admin-kv`), never on-chain — the
 * same trust boundary as the processor's locally-stored unlock passkey. They
 * are the inputs to the AES-encrypted bundle the host uploads to Bulletin; the
 * registry only ever sees the resulting CID.
 */
export const TERMINAL_SECRETS_KEY = "payment-processor-terminal-secrets/v1" as const;

export interface TerminalSecret {
  readonly topicId: string;
  readonly pemFile: string;
}

interface StoredPayloadV1 {
  readonly version: 1;
  readonly secrets: Record<string, TerminalSecret>;
}

export interface TerminalSecretsState {
  readonly secrets: ReadonlyMap<string, TerminalSecret>;
  readonly hydrated: boolean;
  hydrate(): Promise<void>;
  getSecret(terminalId: string): TerminalSecret | null;
  saveSecret(terminalId: string, secret: TerminalSecret): void;
}

let hydrating: Promise<void> | null = null;

function encode(secrets: ReadonlyMap<string, TerminalSecret>): StoredPayloadV1 {
  const out: Record<string, TerminalSecret> = {};
  for (const [id, secret] of secrets) out[id] = secret;
  return { version: 1, secrets: out };
}

function decode(raw: unknown): Map<string, TerminalSecret> {
  const out = new Map<string, TerminalSecret>();
  if (raw == null || typeof raw !== "object") return out;
  const obj = raw as { version?: unknown; secrets?: unknown };
  if (obj.version !== 1 || obj.secrets == null || typeof obj.secrets !== "object") return out;
  for (const [id, value] of Object.entries(obj.secrets as Record<string, unknown>)) {
    if (id.length === 0 || value == null || typeof value !== "object") continue;
    const v = value as Partial<TerminalSecret>;
    if (typeof v.topicId === "string" && typeof v.pemFile === "string") {
      out.set(id, { topicId: v.topicId, pemFile: v.pemFile });
    }
  }
  return out;
}

function persist(next: ReadonlyMap<string, TerminalSecret>): void {
  const store = cachedAdminKvStore();
  if (store == null) return;
  void store.setJSON(TERMINAL_SECRETS_KEY, encode(next));
}

export const useTerminalSecretsStore = create<TerminalSecretsState>((set, get) => ({
  secrets: new Map(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrating != null) return hydrating;
    hydrating = (async () => {
      const store = await getAdminKvStore();
      if (store == null) {
        set({ hydrated: true });
        return;
      }
      try {
        const raw = await store.getJSON<unknown>(TERMINAL_SECRETS_KEY);
        set({ secrets: decode(raw) });
      } catch (caught) {
        console.warn("[payment-processors] terminal-secrets hydrate failed", caught);
      } finally {
        set({ hydrated: true });
      }
    })();
    return hydrating;
  },

  getSecret: (terminalId) => get().secrets.get(terminalId) ?? null,

  saveSecret: (terminalId, secret) => {
    const next = new Map(get().secrets);
    next.set(terminalId, secret);
    set({ secrets: next });
    persist(next);
  },
}));

export function useTerminalSecrets(): TerminalSecretsState {
  const hydrate = useTerminalSecretsStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return useTerminalSecretsStore();
}
