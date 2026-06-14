// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Load + decrypt an already-published processor config — the "new device"
 * path. The registry record supplies the CID; the operator supplies the group
 * passkey; the decrypted bundle re-hydrates the editor AND the local
 * terminal-secrets store, so existing terminal keys are restored instead of
 * regenerated (regenerating would orphan every terminal already configured
 * with the published keys).
 *
 * Fail-closed: gateway errors, oversized payloads, a wrong passkey, a
 * tampered envelope, non-JSON plaintext, a group-id mismatch, and a bundle
 * without v2 terminals all throw `PublishedConfigLoadError`.
 */
import { envConfig } from "@/config.ts";
import {
  type FetchBulletinPreimage,
  fetchBulletinPreimage,
  resolveNetwork,
} from "@shared/chain/host";
import {
  CredentialEnvelopeError,
  decryptCredentialEnvelope,
} from "@shared/utils/wire/credential-envelope.ts";
import { gatewayUrlForCid } from "./processor-config-storage.ts";
import type { ProcessorConfigBundle } from "../payment-processor-model.ts";

/** Mirrors the processor's own cap on fetched envelopes. */
const MAX_ENVELOPE_BYTES = 256 * 1024;

export class PublishedConfigLoadError extends Error {
  override readonly name = "PublishedConfigLoadError";
}

export interface LoadPublishedProcessorConfigOptions {
  readonly groupId: string;
  readonly cid: string;
  readonly passkey: string;
  /** Test seam — defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Host preimage fetch. Defaults to the real transport; tests stub it. */
  readonly fetchPreimage?: FetchBulletinPreimage;
}

export async function loadPublishedProcessorConfig(
  opts: LoadPublishedProcessorConfigOptions,
): Promise<ProcessorConfigBundle> {
  const fetchPreimage = opts.fetchPreimage ?? fetchBulletinPreimage;
  const pre = await fetchPreimage(opts.cid);
  if (pre.kind === "ok") return decodeProcessorBundle(pre.bytes, opts.groupId, opts.passkey);
  if (pre.kind === "unavailable") {
    throw new PublishedConfigLoadError(
      `Couldn't fetch Bulletin content for ${opts.cid}: ${pre.reason}`,
    );
  }
  const bytes = await fetchEnvelopeViaGateway(opts.cid, opts.fetchImpl);
  return decodeProcessorBundle(bytes, opts.groupId, opts.passkey);
}

async function fetchEnvelopeViaGateway(
  cid: string,
  fetchImpl?: typeof fetch,
): Promise<Uint8Array> {
  const url = gatewayUrlForCid(resolveNetwork(envConfig.chain.network).ipfsGateway, cid);
  // A detached `fetch` reference loses its Window receiver — wrap, don't alias.
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch {
    throw new PublishedConfigLoadError(`Couldn't reach the IPFS gateway (${url}).`);
  }
  if (!response.ok) {
    throw new PublishedConfigLoadError(`Gateway returned HTTP ${response.status} for ${url}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function decodeProcessorBundle(
  bytes: Uint8Array,
  groupId: string,
  passkey: string,
): Promise<ProcessorConfigBundle> {
  if (bytes.length > MAX_ENVELOPE_BYTES) {
    throw new PublishedConfigLoadError("Envelope is unexpectedly large — refusing to process.");
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new PublishedConfigLoadError("Bulletin payload was not a JSON envelope.");
  }

  let plaintext: Uint8Array;
  try {
    plaintext = await decryptCredentialEnvelope(envelope, passkey);
  } catch (caught) {
    if (caught instanceof CredentialEnvelopeError) {
      throw new PublishedConfigLoadError("Couldn't unlock — wrong passkey or tampered envelope.");
    }
    throw caught;
  }

  let bundle: ProcessorConfigBundle;
  try {
    bundle = JSON.parse(new TextDecoder().decode(plaintext)) as ProcessorConfigBundle;
  } catch {
    throw new PublishedConfigLoadError("Decrypted payload is not JSON.");
  }
  if (typeof bundle !== "object" || bundle === null || bundle.groupId !== groupId) {
    const got = (bundle as { groupId?: unknown } | null)?.groupId;
    throw new PublishedConfigLoadError(
      `Decrypted bundle belongs to group "${typeof got === "string" ? got : "?"}", expected "${groupId}".`,
    );
  }
  if (!Array.isArray(bundle.v2?.terminals) || bundle.v2.terminals.length === 0) {
    throw new PublishedConfigLoadError(
      "Published bundle carries no v2 terminals — published in an unsupported format.",
    );
  }
  return bundle;
}
