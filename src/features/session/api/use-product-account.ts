/**
 * `useProductAccount` — resolves the signed-in host product account for
 * the admin console.
 *
 * Auto-initing host-wallet store (`@/sdk`'s `useHostWallet`) is
 * the single source of truth for the boot sequence. This hook is a
 * thin projection of the store's `ready` state into the admin-specific
 * `ProductAccountState` union (which adds `ReadyAdminAccount` and
 * surfaces `requesting` / `resolving` as discrete states for the
 * admin's CTA / splash UI).
 *
 * Boot order (mirrored from the store, which mirrors
 * w3s-conference-app's `wallet.ts`):
 *
 *   1. `connectToHost()` — `sandboxTransport.isReady()` with a 15s
 *      budget. Without it, `getProductAccount` races the handshake on
 *      mobile and the SDK returns `RequestCredentialsErr::Unknown`
 *      with reason `"Polkadot host is not ready"`.
 *   2. `injectHostWallet()` — the iOS-specific gate. Performs the
 *      webview-port bring-up polling that lets subsequent host-API
 *      requests succeed on Polkadot mobile. This is the single step
 *      the conference-app's working mobile flow does that the
 *      previous w3spay-admin implementation was missing.
 *   3. `getProductAccount(productIdentifier, index)` — resolve the
 *      product account.
 *   4. `getProductAccountSigner(account, "createTransaction")` —
 *      build the signer; the host assembles and signs the extrinsic
 *      server-side, so Paseo Asset Hub Next's custom
 *      signed-extensions (`AsPgas`, …) are handled correctly.
 *   5. `claimResourceAllowances` — claim `BulletInAllowance` +
 *      `SmartContractAllowance:0` + `AutoSigning`. Cached.
 *
 * The admin overlay adds its own `requestAccess` flow (the host's
 * "Approve" modal) on top of the auto-initing store.
 */

import { useCallback, useMemo } from "react";
import {
  requestAccessHostWallet,
  retryHostWallet,
  useHostWallet,
  type HostWalletState,
} from "@shared/api/host";

import { envConfig } from "@shared/config.ts";
import { deriveH160 } from "@shared/utils/address.ts";
import {
  buildAdminGrantIdentity,
  type ProductAccountState,
  type UseProductAccountResult,
} from "@features/session/account.ts";

export function useProductAccount(): UseProductAccountResult {
  
  const productIdentifier = envConfig.host.productDotNs
  console.log("final product identifier:", productIdentifier);
  const derivationIndex = envConfig.host.productDerivationIndex;

  // The store handles the full boot sequence: handshake → injectSpektrExtension
  // → getProductAccount → getProductAccountSigner("createTransaction") →
  // claimResourceAllowances. We just project its `ready` state into the
  // admin's `ProductAccountState` union.
  
  const wallet = useHostWallet({
    productIdentifier,
    derivationIndex,
  });
  console.info("[useProductAccount] wallet state:", wallet.state);
  console.info("[useProductAccount] wallet address:", wallet.address);
  const state: ProductAccountState = useMemo(
    () => projectState(wallet.state, productIdentifier, derivationIndex),
    [wallet.state, productIdentifier, derivationIndex],
  );

  const requestAccess = useCallback(async () => {
    await requestAccessHostWallet("Request W3sPay admin access");
  }, []);

  const refresh = useCallback(async () => {
    await retryHostWallet();
  }, []);

  return { state, requestAccess, refresh };
}

/**
 * Project the wallet store's state into the admin's `ProductAccountState`
 * union. The mapping is total (no fallback `default:`) so the compiler
 * can flag missing variants.
 */
function projectState(
  s: HostWalletState,
  productIdentifier: string,
  derivationIndex: number,
): ProductAccountState {
  if (s.kind === "outside-host") return { kind: "outside-host" };
  if (s.kind === "pending") return { kind: "pending" };
  if (s.kind === "resolving") {
    // The store's "resolving" phase covers handshake through
    // claim-allowances. Surface as `resolving` so the splash UI can
    // show a spinner without a "request access" CTA.
    if (s.phase === undefined) return { kind: "pending" };
    return { kind: "resolving" };
  }
  if (s.kind === "requesting-access") {
    // The store flipped to this when `requestAccessHostWallet` started;
    // surface as `requesting` so the admin's CTA shows the in-flight
    // "Approving" state.
    return { kind: "requesting" };
  }
  if (s.kind === "error") return { kind: "error", reason: s.reason };
  if (s.kind === "ready") {
    const publicKey = s.productAccount.publicKey;
    const identity = buildAdminGrantIdentity(
      publicKey,
      deriveH160(publicKey),
      productIdentifier,
      derivationIndex,
    );
    return {
      kind: "ready",
      account: {
        ...identity,
        productAccount: s.productAccount,
        signer: s.signer,
      },
    };
  }
  // Exhaustive: the compiler will flag if a new variant is added without
  // a corresponding projection.
  const _exhaustive: never = s;
  void _exhaustive;
  return { kind: "error", reason: "unknown host-wallet state" };
}
