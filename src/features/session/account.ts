import type { ProductAccount } from "@/shared/api/host";
import type { PolkadotSigner } from "polkadot-api";

import { envConfig } from "@shared/config.ts";
import {
  bytesToHex,
  normalizeH160Address,
  publicKeyToSs58,
  type AccountId32Hex,
  type H160Hex,
} from "@shared/utils/address.ts";
import type { UseIsAdminResult } from "@features/session/api/is-admin.ts";

export interface AdminGrantIdentity {
  readonly productIdentifier: string;
  readonly derivationIndex: number;
  readonly ss58Address: string;
  readonly accountId32: AccountId32Hex;
  readonly adminH160: H160Hex;
  readonly copyTarget: H160Hex;
}

export interface ReadyAdminAccount extends AdminGrantIdentity {
  readonly productAccount: ProductAccount;
  readonly signer: PolkadotSigner;
}

export type ProductAccountState =
  | { kind: "pending" }
  | { kind: "outside-host" }
  | { kind: "disconnected" }
  | { kind: "requesting" }
  | { kind: "resolving" }
  | { kind: "ready"; account: ReadyAdminAccount }
  | { kind: "error"; reason: string };

export type AdminAccountState = ProductAccountState;

export interface UseProductAccountResult {
  state: ProductAccountState;
  requestAccess(): Promise<void>;
  refresh(): Promise<void>;
}

export interface UseAdminAccountResult {
  state: AdminAccountState;
  isAdmin: UseIsAdminResult;
  requestAccess(): Promise<void>;
  refresh(): Promise<void>;
}

export function selectAdminCopyTarget(identity: Pick<AdminGrantIdentity, "adminH160">): H160Hex {
  return identity.adminH160;
}

export function buildAdminGrantIdentity(
  publicKey: Uint8Array,
  adminH160: string,
  productIdentifier = envConfig.host.productDotNs,
  derivationIndex = envConfig.host.productDerivationIndex,
): AdminGrantIdentity {
  const identity = {
    productIdentifier,
    derivationIndex,
    ss58Address: publicKeyToSs58(publicKey),
    accountId32: bytesToHex(publicKey),
    adminH160: normalizeH160Address(adminH160),
  };
  return { ...identity, copyTarget: selectAdminCopyTarget(identity) };
}
