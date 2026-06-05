/**
 * Synthetic admin identity used in demo mode.
 *
 * Anchored on the well-known SR25519 "Alice" public key from the
 * Polkadot/Substrate dev keyring so the SS58 address it renders is one
 * a Substrate-savvy reviewer recognises immediately. The derived H160
 * follows the same `deriveH160(publicKey)` path the real product-account
 * flow uses, which keeps copy targets, mapping, and dry-run logic
 * indistinguishable from a real signed-in session.
 *
 * The `PolkadotSigner` is intentionally a thrown error — demo writes
 * never reach the signer because every action is intercepted by the
 * in-memory `useDemoMerchantStore` before the chain layer is touched.
 * If something does try to sign in demo mode, that's a bug we want to
 * surface loudly, not silently no-op.
 */
import type { ProductAccount } from "@/shared/api/host";
import type { PolkadotSigner } from "polkadot-api";

import { envConfig } from "@shared/config.ts";
import { buildAdminGrantIdentity, type ReadyAdminAccount } from "@features/session/account.ts";
import { deriveH160, hexToBytes } from "@shared/utils/address.ts";

/**
 * Canonical SR25519 "Alice" public key from the Polkadot/Substrate dev
 * keyring. Pinning a well-known value (rather than generating one)
 * makes screenshots reproducible across sessions.
 */
export const DEMO_PUBLIC_KEY_HEX =
  "0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d" as const;

export const DEMO_PUBLIC_KEY: Uint8Array = hexToBytes(DEMO_PUBLIC_KEY_HEX);

/**
 * H160 mirror of `DEMO_PUBLIC_KEY`, derived via the same
 * `deriveH160(publicKey)` path the real product-account flow uses
 * (`keccak256(publicKey).slice(-20)`). Computed once at module load —
 * keeping the derivation here means there is no precomputed literal that
 * could drift from `DEMO_PUBLIC_KEY_HEX`.
 */
export const DEMO_ADMIN_H160 = deriveH160(DEMO_PUBLIC_KEY);

const DEMO_SIGNER: PolkadotSigner = {
  publicKey: DEMO_PUBLIC_KEY,
  signTx: () => {
    throw new Error(
      "Demo mode: synthetic signer was invoked. Demo writes must be intercepted before the chain layer is reached.",
    );
  },
  signBytes: () => {
    throw new Error(
      "Demo mode: synthetic signer was invoked. Demo writes must be intercepted before the chain layer is reached.",
    );
  },
};

/**
 * Build the `ReadyAdminAccount` used in demo mode. Always returns a new
 * object so changes (none today) wouldn't leak across renders if the
 * caller ever mutated it.
 */
export function buildDemoReadyAdminAccount(): ReadyAdminAccount {
  const identity = buildAdminGrantIdentity(DEMO_PUBLIC_KEY, DEMO_ADMIN_H160);
  const productAccount: ProductAccount = {
    dotNsIdentifier: envConfig.host.productDotNs,
    derivationIndex: envConfig.host.productDerivationIndex,
    publicKey: DEMO_PUBLIC_KEY,
  };
  return {
    ...identity,
    productAccount,
    signer: DEMO_SIGNER,
  };
}
