// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  connectToHost,
  enumValue,
  hostApi,
  isInHost,
  requestPermission,
  runExclusiveHostModal,
} from "@/shared/chain/host";

/** Outcome of probing chain support; `unsupported` means reads fall back to direct WS, `unavailable` means the host transport itself failed. */
export type ChainSupport =
  | { kind: "supported" }
  | { kind: "unsupported"; reason: string }
  | { kind: "unavailable"; reason: string };

export async function checkHostChainSupport(
  genesisHash: `0x${string}`,
): Promise<ChainSupport> {
  // Safe to call at boot — wait for the transport handshake before issuing
  // the feature check, so a probe fired in parallel with the wallet init
  // can't race the host port bring-up. `connectToHost` is in-flight-deduped,
  // so multiple boot subsystems share a single handshake promise.
  const ready = await connectToHost();
  if (!ready) {
    return { kind: "unavailable", reason: "host transport not ready" };
  }
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
 * RemotePermission variants exposed by the low-level Host API.
 *
 * NOTE: the WebRTC variant value is intentionally `"WebRtc"` (lowercase `tc`) to
 * match the wrapper's 0.8.3 type signatures, derived from a nested older host-api
 * that uses the lowercased tag. The runtime codec in the outer host-api uses the
 * correct `"WebRTC"` tag, so the SCALE wire payload is right even though the type
 * literal is wrong. Flip back to `"WebRTC"` once the wrapper's nested types are fixed.
 */
export type RemotePermissionKind =
  | "ChainSubmit"
  | "PreimageSubmit"
  | "StatementSubmit"
  | "WebRtc";

/**
 * Result of a `requestPermission` round-trip. Idempotent after a prior grant —
 * the host returns `ok(true)` without re-prompting.
 */
export interface RemotePermissionOutcome {
  readonly granted: boolean;
  readonly error?: string;
}

export async function requestRemotePermission(
  kind: RemotePermissionKind,
): Promise<RemotePermissionOutcome> {
  // Same boot-time safety guard as `checkHostChainSupport`: await the
  // transport handshake before queueing the modal. Without this, a probe
  // fired at boot could enter `runExclusiveHostModal`'s queue before the
  // host port is up, and the underlying `requestPermission` call would
  // fail with a transport error instead of waiting for readiness.
  const ready = await connectToHost();
  if (!ready) {
    return { granted: false, error: "host transport not ready" };
  }
  // Serialized: the host shows one modal at a time, so this prompt must wait
  // for any prior boot modal (Sentry remote-origins, an earlier permission)
  // to close — otherwise the host drops it and the gate stalls.
  return runExclusiveHostModal(() =>
    requestPermission({ tag: kind, value: undefined }).match<RemotePermissionOutcome>(
      (granted) => ({ granted }),
      (err) => ({ granted: false, error: err.payload.reason }),
    ),
  );
}
