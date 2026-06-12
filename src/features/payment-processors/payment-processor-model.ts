// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Model for the Payment Processors feature: the encrypted config bundle the
 * admin publishes and the processor consumes at unlock.
 *
 * The `ProcessorConfigBundle` shape is the contract between this app and
 * `w3s-payment-processor`'s `loadRemoteCredentialBundle` /
 * `loadProcessorConfig`. Keep it byte-for-byte compatible with what that
 * parser validates:
 *   - `profile.merchantName` + `profile.merchantId` — required, non-empty.
 *   - `v1` carries EXACTLY ONE of `remote` | `local`; we always emit `local`.
 *   - every `label` is OMITTED when empty (the parser rejects an empty `label`).
 *   - `v2.terminals` carries ≥1 terminal (v2 is enabled by default on the
 *     processor); each `topicId` is 64-char lowercase hex and unique, and each
 *     `pemFile` must parse as a P-256 private key.
 *
 * Each selected terminal becomes BOTH a `v1.local` entry and a `v2` entry, so
 * the bundle satisfies any v1/v2 enablement combination the processor runs.
 */

import { normalizeMerchantDestinationInput } from "@shared/lib/address.ts";
import { parseP256PrivateKeyPem, PemError } from "@shared/utils/wire/pem.ts";

/** A v1 (RFC-6 payments) terminal row inside the published bundle. */
export interface ProcessorBundleV1Terminal {
  readonly terminalId: string;
  /** Display label; omitted entirely when empty. */
  readonly label?: string;
  /** SS58 or AccountId32-hex payout destination. */
  readonly payoutAddress: string;
}

/** A v2 (coinage-key payments) terminal row inside the published bundle. */
export interface ProcessorBundleV2Terminal {
  /** 64-char lowercase hex on-wire topic. */
  readonly topicId: string;
  readonly terminalId: string;
  /** Display label; omitted entirely when empty. */
  readonly label?: string;
  /** SS58 or AccountId32-hex payout destination. */
  readonly payoutAddress: string;
  /** P-256 private-key PEM the processor parses at unlock. */
  readonly pemFile: string;
}

/** The full decrypted bundle, byte-compatible with the processor's parser. */
export interface ProcessorConfigBundle {
  readonly groupId: string;
  readonly profile: {
    readonly merchantName: string;
    readonly merchantId: string;
  };
  readonly v1: {
    readonly type: "rfc6-payments";
    readonly local: {
      readonly terminals: ProcessorBundleV1Terminal[];
    };
  };
  readonly v2: {
    readonly type: "coinage-key-payments";
    readonly terminals: ProcessorBundleV2Terminal[];
  };
}

// ===================== Form model =====================

/** One terminal row in the processor-config form (a selected terminal registration + its v2 secrets). */
export interface ProcessorTerminalForm {
  readonly terminalId: string;
  readonly label: string;
  readonly payoutAddress: string;
  /** 64-char hex on-wire topic. */
  readonly topicId: string;
  /** P-256 private-key PEM. */
  readonly pemFile: string;
}

/** The full payment-processor config form an operator fills out before publishing. */
export interface ProcessorConfigForm {
  /** Restaurant/group id — the on-chain key. */
  readonly groupId: string;
  readonly merchantName: string;
  readonly merchantId: string;
  readonly terminals: ProcessorTerminalForm[];
  /** AES passkey the processor enters at unlock to decrypt this bundle. */
  readonly passkey: string;
}

const TOPIC_ID_RE = /^[0-9a-f]{64}$/;

/**
 * Assemble the encrypted-bundle payload from form input. Each selected terminal
 * becomes BOTH a `v1.local` entry and a `v2` entry; empty `label`s are omitted
 * (the processor rejects an empty `label`). Call `validateProcessorForm` first.
 */
export function buildProcessorBundle(form: ProcessorConfigForm): ProcessorConfigBundle {
  const v1Terminals: ProcessorBundleV1Terminal[] = form.terminals.map((t) => {
    const label = t.label.trim();
    const base = { terminalId: t.terminalId.trim(), payoutAddress: t.payoutAddress.trim() };
    return label.length > 0 ? { ...base, label } : base;
  });
  const v2Terminals: ProcessorBundleV2Terminal[] = form.terminals.map((t) => {
    const label = t.label.trim();
    const base = {
      topicId: t.topicId.trim().toLowerCase(),
      terminalId: t.terminalId.trim(),
      payoutAddress: t.payoutAddress.trim(),
      pemFile: t.pemFile,
    };
    return label.length > 0 ? { ...base, label } : base;
  });
  return {
    groupId: form.groupId.trim(),
    profile: { merchantName: form.merchantName.trim(), merchantId: form.merchantId.trim() },
    v1: { type: "rfc6-payments", local: { terminals: v1Terminals } },
    v2: { type: "coinage-key-payments", terminals: v2Terminals },
  };
}

/**
 * Rebuild the editable form from a decrypted published bundle — the inverse of
 * `buildProcessorBundle` for the unlock-edit ("new device") path. The v2
 * terminal list is authoritative (it carries the topic + PEM); absent labels
 * map back to empty strings so inputs stay controlled.
 */
export function bundleToForm(bundle: ProcessorConfigBundle, passkey: string): ProcessorConfigForm {
  return {
    groupId: bundle.groupId,
    merchantName: bundle.profile.merchantName,
    merchantId: bundle.profile.merchantId,
    passkey,
    terminals: bundle.v2.terminals.map((t) => ({
      terminalId: t.terminalId,
      label: t.label ?? "",
      payoutAddress: t.payoutAddress,
      topicId: t.topicId,
      pemFile: t.pemFile,
    })),
  };
}

/**
 * Validate a processor-config form. Returns a human-readable error string, or
 * `null` when the form is publishable. Checks the same invariants the
 * processor's parser enforces so a published bundle always unlocks: required
 * identity fields, ≥1 terminal, a passkey, and per-terminal a 64-hex unique
 * topicId, a valid payout address, and a parseable P-256 PEM.
 */
export function validateProcessorForm(form: ProcessorConfigForm): string | null {
  if (form.groupId.trim().length === 0) return "Select a restaurant/group.";
  if (form.merchantName.trim().length === 0) return "Merchant name is required.";
  if (form.merchantId.trim().length === 0) return "Merchant ID is required.";
  if (form.passkey.length === 0) return "A group passkey is required.";
  if (form.terminals.length === 0) return "Select at least one terminal.";

  const seenTopics = new Set<string>();
  for (const t of form.terminals) {
    const label = t.terminalId.trim() || "(unnamed terminal)";
    const topicId = t.topicId.trim().toLowerCase();
    if (!TOPIC_ID_RE.test(topicId)) {
      return `Terminal ${label}: topicId must be 64 hex characters.`;
    }
    if (seenTopics.has(topicId)) {
      return `Terminal ${label}: topicId is duplicated — each terminal needs a unique topic.`;
    }
    seenTopics.add(topicId);

    try {
      normalizeMerchantDestinationInput(t.payoutAddress);
    } catch {
      return `Terminal ${label}: payout address is not a valid SS58 / AccountId32 / H160 address.`;
    }

    if (t.pemFile.trim().length === 0) return `Terminal ${label}: a P-256 key PEM is required.`;
    try {
      parseP256PrivateKeyPem(t.pemFile);
    } catch (caught) {
      const reason = caught instanceof PemError ? caught.message : "unparseable PEM";
      return `Terminal ${label}: invalid key PEM — ${reason}.`;
    }
  }
  return null;
}

// ===================== List view state =====================

/** What the processor-config list surfaces should render. */
export type ProcessorListViewState =
  | { kind: "skeleton" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "rows" };

/**
 * Pure render-state discriminator for the registry list query. Order matters:
 * stale rows beat a background refetch error (the poll heals transient
 * failures), an error beats the empty card (an unreachable registry is NOT
 * "no configs published" — rendering it as empty hides outages and
 * wrong-registry builds), and only a settled, error-free, zero-row query is
 * genuinely empty.
 */
export function processorListViewState(query: {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly rowCount: number;
}): ProcessorListViewState {
  if (query.rowCount > 0) return { kind: "rows" };
  if (query.isError) {
    const message =
      query.error instanceof Error ? query.error.message : String(query.error);
    return { kind: "error", message };
  }
  if (query.isLoading) return { kind: "skeleton" };
  return { kind: "empty" };
}
