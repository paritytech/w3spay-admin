/**
 * Versioned envelope for item-config payloads on Bulletin Chain.
 *
 * The envelope is intentionally tiny + unencrypted: T3rminal devices
 * decode it directly after fetching by CID. `publishedAt` means each
 * publish produces a fresh CID even when the inner config body is byte-
 * identical to the previous one — that is the point: a new
 * `bulletinBlock`/`bulletinTxIndex` lets the renewal pipeline keep the
 * payload alive past the retention window.
 *
 * `decodeItemConfigEnvelope` is defensive — it parses arbitrary input
 * (untrusted gateway response) and returns `null` for anything that does
 * not match v1. Callers should treat a `null` return as "remote payload
 * is corrupt or from a future schema; surface the CID to the operator".
 */

import type { ItemConfig } from "@features/items/items-model.ts";

export const W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE = "w3spay-item-config" as const;
export const W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION = 1 as const;

export interface W3SPayItemConfigEnvelopeV1 {
  readonly type: typeof W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE;
  readonly v: typeof W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION;
  readonly config: ItemConfig;
  readonly publishedAt: string;
  /** SS58 of the admin product account that signed the publish tx. */
  readonly publishedBy: string;
}

export interface BuildItemConfigEnvelopeArgs {
  readonly config: ItemConfig;
  readonly publishedAt: string;
  readonly publishedBy: string;
}

/** Build the envelope as a typed object (no encoding). */
export function buildItemConfigEnvelope(args: BuildItemConfigEnvelopeArgs): W3SPayItemConfigEnvelopeV1 {
  return {
    type: W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
    v: W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION,
    config: args.config,
    publishedAt: args.publishedAt,
    publishedBy: args.publishedBy,
  };
}

/**
 * Minified JSON encoding — every Bulletin store + CID derivation MUST go
 * through this so the on-chain CID is reproducible. Avoid `JSON.stringify`
 * with whitespace; the chain only stores raw bytes.
 */
export function encodeItemConfigEnvelope(envelope: W3SPayItemConfigEnvelopeV1): Uint8Array {
  const json = JSON.stringify(envelope);
  return TEXT_ENCODER.encode(json);
}

/** Convenience: build + encode in one call. */
export function buildAndEncodeItemConfigEnvelope(args: BuildItemConfigEnvelopeArgs): {
  readonly envelope: W3SPayItemConfigEnvelopeV1;
  readonly bytes: Uint8Array;
} {
  const envelope = buildItemConfigEnvelope(args);
  return { envelope, bytes: encodeItemConfigEnvelope(envelope) };
}

/**
 * Defensively decode raw bytes (or a JSON string) into a v1 envelope.
 * Returns `null` on every failure path — schema mismatch, missing
 * fields, wrong types — so callers branch on truthiness instead of
 * try/catching.
 */
export function decodeItemConfigEnvelope(
  source: Uint8Array | string,
): W3SPayItemConfigEnvelopeV1 | null {
  let json: string;
  if (typeof source === "string") {
    json = source;
  } else {
    json = TEXT_DECODER.decode(source);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if ((parsed as { type?: unknown }).type !== W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE) return null;
  if ((parsed as { v?: unknown }).v !== W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION) return null;
  const publishedAt = (parsed as { publishedAt?: unknown }).publishedAt;
  const publishedBy = (parsed as { publishedBy?: unknown }).publishedBy;
  const config = (parsed as { config?: unknown }).config;
  if (typeof publishedAt !== "string" || typeof publishedBy !== "string") return null;
  if (!isItemConfigShape(config)) return null;
  return {
    type: W3SPAY_ITEM_CONFIG_ENVELOPE_TYPE,
    v: W3SPAY_ITEM_CONFIG_ENVELOPE_VERSION,
    config,
    publishedAt,
    publishedBy,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isItemConfigShape(value: unknown): value is ItemConfig {
  if (!isPlainObject(value)) return false;
  const id = value.id;
  const name = value.name;
  const updatedAt = value.updatedAt;
  const items = value.items;
  if (typeof id !== "string" || typeof name !== "string" || typeof updatedAt !== "string") {
    return false;
  }
  if (!Array.isArray(items)) return false;
  return items.every((item) => {
    if (!isPlainObject(item)) return false;
    return (
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.price === "number" &&
      Number.isFinite(item.price) &&
      item.price >= 0
    );
  });
}

const TEXT_ENCODER = /* @__PURE__ */ new TextEncoder();
const TEXT_DECODER = /* @__PURE__ */ new TextDecoder();
