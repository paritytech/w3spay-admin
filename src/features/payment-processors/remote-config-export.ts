// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Remote-config export for POS terminals. The payer app scans a QR carrying
 * only the `terminalId`, looks it up in its remote config, and publishes its
 * encrypted payment statement on `topic` using `key`:
 *
 *   { "<terminalId>": { "topic": "<base64url 32B>", "key": "<base64url 33B>", "name": "Zola" } }
 *
 * `topic` = the 32-byte statement topic (the bundle's hex `topicId`);
 * `key` = the terminal's P-256 PUBLIC key as a 33-byte SEC1 compressed point.
 * Both base64url (RFC 4648 §5, no padding).
 *
 * SECURITY: remote config is readable by every app instance, so only PUBLIC
 * material goes here. The private scalar never leaves the encrypted bundle.
 */
import { hexToBytes } from "@noble/hashes/utils.js";

import { base64UrlEncode } from "@shared/lib/t3rminal-config-qr.ts";
import { extractP256CompressedPublicKey } from "@shared/utils/wire/pem.ts";
import type { ProcessorConfigForm } from "./payment-processor-model.ts";

export interface RemoteConfigEntry {
  readonly topic: string;
  readonly key: string;
  readonly name: string;
}

/**
 * Build the remote-config object, keyed by terminalId. Call
 * `validateProcessorForm` first. `name` is the terminal label, falling back
 * to the merchant name.
 */
export function buildRemoteConfigExport(
  form: ProcessorConfigForm,
): Record<string, RemoteConfigEntry> {
  const out: Record<string, RemoteConfigEntry> = {};
  for (const t of form.terminals) {
    const label = t.label.trim();
    out[t.terminalId.trim()] = {
      topic: base64UrlEncode(hexToBytes(t.topicId.trim().toLowerCase())),
      key: base64UrlEncode(extractP256CompressedPublicKey(t.pemFile)),
      name: label.length > 0 ? label : form.merchantName.trim(),
    };
  }
  return out;
}

/** One terminalId mapped by more than one config in a merged export. */
export interface RemoteConfigConflict {
  readonly terminalId: string;
  /** Group ids that map this terminal — repeats a group when it maps the id twice. */
  readonly groupIds: readonly string[];
}

/** Thrown by `buildMergedRemoteConfigExport`; lists EVERY conflict so the operator can resolve all at once. */
export class RemoteConfigConflictError extends Error {
  override readonly name = "RemoteConfigConflictError";
  readonly conflicts: readonly RemoteConfigConflict[];

  constructor(conflicts: readonly RemoteConfigConflict[]) {
    const detail = conflicts
      .map((c) => `terminal ${c.terminalId} is mapped in ${c.groupIds.join(" and ")}`)
      .join("; ");
    super(
      `Conflicting terminal mappings: ${detail}. ` +
        "Remove the terminal from all but one config, re-publish, then export again.",
    );
    this.conflicts = conflicts;
  }
}

/**
 * Map-join several processor configs into one remote-config export.
 * Fail-closed: a (trimmed) terminalId mapped by more than one config is
 * ambiguous for the payer app, so throw `RemoteConfigConflictError` instead
 * of letting a last-writer merge silently misroute payments.
 */
export function buildMergedRemoteConfigExport(
  forms: readonly ProcessorConfigForm[],
): Record<string, RemoteConfigEntry> {
  const owners = new Map<string, string[]>();
  for (const form of forms) {
    const groupId = form.groupId.trim();
    for (const t of form.terminals) {
      const id = t.terminalId.trim();
      const seen = owners.get(id);
      if (seen == null) owners.set(id, [groupId]);
      else seen.push(groupId);
    }
  }
  const conflicts: RemoteConfigConflict[] = [];
  for (const [terminalId, groupIds] of owners) {
    if (groupIds.length > 1) conflicts.push({ terminalId, groupIds });
  }
  if (conflicts.length > 0) throw new RemoteConfigConflictError(conflicts);

  const out: Record<string, RemoteConfigEntry> = {};
  for (const form of forms) Object.assign(out, buildRemoteConfigExport(form));
  return out;
}
