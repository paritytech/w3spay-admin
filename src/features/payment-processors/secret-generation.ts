// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Per-terminal v2 secret generation — both values come from the platform
 * CSPRNG (`crypto.getRandomValues` / `crypto.subtle.generateKey`, OS
 * hardware-entropy seeded): a 32-byte hex `topicId` (the on-wire statement
 * topic) and a fresh P-256 private key as a PKCS#8 PEM. Secrets persist in
 * the terminal-secrets store; the published encrypted bundle is the
 * cross-device source of truth (see `processor-config-load.ts`).
 */
import { extractP256CompressedPublicKey } from "@shared/utils/wire/pem.ts";

import type { TerminalSecret } from "./store/use-terminal-secrets-store.ts";

export function generateTopicId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

const PEM_LINE_WIDTH = 64;

export async function generateP256PrivateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (const b of der) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += PEM_LINE_WIDTH) {
    lines.push(b64.slice(i, i + PEM_LINE_WIDTH));
  }
  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
  // Fail-closed: the remote-config export derives the payer-facing PUBLIC key
  // from this PEM's embedded `[1]` point; refuse at generation time if a
  // runtime ever omits it.
  extractP256CompressedPublicKey(pem);
  return pem;
}

export async function generateTerminalSecret(): Promise<TerminalSecret> {
  return { topicId: generateTopicId(), pemFile: await generateP256PrivateKeyPem() };
}
