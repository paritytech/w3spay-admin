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
