/**
 * Thin wrapper over the host-permission surface exposed by @/sdk/host.
 *
 * The SDK uses neverthrow + scale-codec enum payloads for both feature probes
 * and runtime permission requests; that's noisy at call sites. This file
 * narrows everything to plain async functions returning discriminated
 * results, so React effects and write paths can branch on them without
 * importing neverthrow / `enumValue` / GenericError directly.
 *
 * What is and isn't gated:
 *   - Chain READS (chainHead_v1_follow, chainHead_v1_call) are NOT gated by
 *     any runtime permission. They are gated by the host advertising chain
 *     support — probe with `checkHostChainSupport(genesisHash)`.
 *   - Chain WRITES (transaction_v1_broadcast) require the `ChainSubmit`
 *     remote permission. Request with `requestRemotePermission("ChainSubmit")`.
 *
 * See the low-level Host API `remotePermission` codec for the full
 * RemotePermission enum surface; there is no `ChainRead` variant.
 */

import { enumValue, hostApi, requestPermission } from "@/shared/chain/host";

/**
 * Outcome of `host_feature_supported(Chain, genesisHash)`.
 *
 *   - `supported`   — host transport is ready AND advertises the chain.
 *   - `unsupported` — host transport is ready but does not advertise the chain.
 *                     Reads must use a fallback transport (direct WS).
 *   - `unavailable` — host transport itself failed (e.g. sandbox bridge is
 *                     down). Carries the upstream `GenericError.payload.reason`.
 */
export type ChainSupport =
  | { kind: "supported" }
  | { kind: "unsupported"; reason: string }
  | { kind: "unavailable"; reason: string };

export async function checkHostChainSupport(
  genesisHash: `0x${string}`,
): Promise<ChainSupport> {
  return hostApi
    .featureSupported(enumValue("v1", enumValue("Chain", genesisHash)))
    .match<ChainSupport>(
      (ok) =>
        ok.value
          ? { kind: "supported" }
          : {
              kind: "unsupported",
              reason: `host does not advertise chain ${genesisHash}`,
            },
      (err) => ({
        kind: "unavailable",
        reason: err.value.payload.reason,
      }),
    );
}

/**
 * RemotePermission variants exposed by the low-level Host API today.
 *
 * `Remote(string[])` is intentionally excluded here — its `value` is the list
 * of origins to grant, so it needs a different signature than the no-argument
 * variants below. That dedicated wrapper now lives in the shared SDK as
 * `requestRemoteOriginPermission(origins)` (`@parity/sdk/host/connection`),
 * used by the telemetry bootstrap to allowlist the Sentry ingest host.
 *
 * NOTE: the value for the WebRTC variant is intentionally `"WebRtc"` (lowercase
 * `tc`) to match the low-level wrapper's 0.8.3 type signatures, which are
 * derived from a nested older host-api that uses the lowercased tag.
 * The runtime codec in the outer host-api uses the correct `"WebRTC"` tag, so
 * the SCALE wire payload is right even though the type literal is wrong. When
 * the wrapper's nested-types are cleaned up, this should be flipped back to
 * `"WebRTC"`.
 */
export type RemotePermissionKind =
  | "ChainSubmit"
  | "PreimageSubmit"
  | "StatementSubmit"
  | "WebRtc";

/**
 * Result of a `requestPermission` round-trip.
 *
 *   - `granted: true`  — host granted (or had previously granted) the permission.
 *   - `granted: false, error: undefined` — user explicitly denied at the prompt.
 *   - `granted: false, error: string`    — transport / encoding failure.
 *
 * Calling this repeatedly after a prior grant is idempotent; the host returns
 * `ok(true)` without re-prompting.
 */
export interface RemotePermissionOutcome {
  readonly granted: boolean;
  readonly error?: string;
}

export async function requestRemotePermission(
  kind: RemotePermissionKind,
): Promise<RemotePermissionOutcome> {
  // `requestPermission` wraps the call in `enumValue("v1", ...)` itself
  // in the low-level SDK; we only have to pass the inner enum variant.
  return requestPermission({ tag: kind, value: undefined }).match<RemotePermissionOutcome>(
    (granted) => ({ granted }),
    (err) => ({ granted: false, error: err.payload.reason }),
  );
}
