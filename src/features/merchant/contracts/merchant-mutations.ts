// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import { useMutation } from "@tanstack/react-query";

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import type { MerchantRegistryWriteContext } from "@shared/chain/merchant-registry-write.ts";

import { addMerchant, type AddMerchantPayload } from "./add-merchant.ts";
import { deleteMerchant, type DeleteMerchantPayload } from "./delete-merchant.ts";
import {
  setMerchantDestination,
  type SetMerchantDestinationPayload,
} from "./set-merchant-destination.ts";
import { setMerchantStatus, type SetMerchantStatusPayload } from "./set-merchant-status.ts";
import type { RegistryMerchantRow } from "@features/merchant/merchant-model.ts";
import {
  applyDelete,
  applyRegister,
  applySetDestination,
  applySetStatus,
  synthesizeTxHash,
} from "@shared/lib/demo/demo-actions.ts";
import { getDemoMerchantRows, setDemoMerchantRows } from "@shared/lib/demo/demo-merchant-registry.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

const SIGNER_NOT_READY = "Wallet signer is not ready yet.";

/** Variables for every registry write mutation: the op payload plus an optional tx lifecycle listener. */
export interface MerchantWriteVariables<P> {
  readonly payload: P;
  readonly onStatus?: (status: TxStatus) => void;
}

async function invalidateRegistry(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryRoots.merchantRegistry });
}

/** Drive the full `TxStatus` lifecycle on a microtask so demo writes emit the same sequence a real chain watcher would. */
function emitStatusLifecycle(onStatus?: (status: TxStatus) => void): Promise<void> {
  if (onStatus == null) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  queueMicrotask(() => {
    onStatus("preparing");
    onStatus("signing");
    onStatus("broadcasting");
    onStatus("in-block");
    onStatus("finalized");
    resolve();
  });
  return promise;
}

async function demoWrite(
  reduce: (rows: ReadonlyArray<RegistryMerchantRow>) => ReadonlyArray<RegistryMerchantRow>,
  onStatus?: (status: TxStatus) => void,
): Promise<string> {
  await emitStatusLifecycle(onStatus);
  setDemoMerchantRows(reduce(getDemoMerchantRows()));
  return synthesizeTxHash();
}

function writeContext(account: ReadyAdminAccount): MerchantRegistryWriteContext {
  return { signer: account.signer, walletAddress: account.ss58Address };
}

/** Register a new merchant/terminal row. Mirrors `useRestaurantWrites().upsert`. */
export function useRegisterMerchant() {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return useMutation({
    mutationFn: ({ payload, onStatus }: MerchantWriteVariables<AddMerchantPayload>): Promise<string> => {
      if (isDemoMode()) {
        return demoWrite((rows) => applyRegister(rows, payload, Date.now()), onStatus);
      }
      if (readyAccount == null) return Promise.reject(new Error(SIGNER_NOT_READY));
      return addMerchant({ context: writeContext(readyAccount), payload, onStatus });
    },
    onSuccess: invalidateRegistry,
  });
}

/** Pause / resume / revoke / reinstate a merchant row. */
export function useSetMerchantStatus() {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return useMutation({
    mutationFn: ({ payload, onStatus }: MerchantWriteVariables<SetMerchantStatusPayload>): Promise<string> => {
      if (isDemoMode()) {
        return demoWrite((rows) => applySetStatus(rows, payload, Date.now()), onStatus);
      }
      if (readyAccount == null) return Promise.reject(new Error(SIGNER_NOT_READY));
      return setMerchantStatus({ context: writeContext(readyAccount), payload, onStatus });
    },
    onSuccess: invalidateRegistry,
  });
}

/** Rotate the payout destination of a merchant row. */
export function useSetMerchantDestination() {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return useMutation({
    mutationFn: ({
      payload,
      onStatus,
    }: MerchantWriteVariables<SetMerchantDestinationPayload>): Promise<string> => {
      if (isDemoMode()) {
        return demoWrite((rows) => applySetDestination(rows, payload, Date.now()), onStatus);
      }
      if (readyAccount == null) return Promise.reject(new Error(SIGNER_NOT_READY));
      return setMerchantDestination({ context: writeContext(readyAccount), payload, onStatus });
    },
    onSuccess: invalidateRegistry,
  });
}

/** Permanently remove a merchant row. */
export function useDeleteMerchant() {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return useMutation({
    mutationFn: ({ payload, onStatus }: MerchantWriteVariables<DeleteMerchantPayload>): Promise<string> => {
      if (isDemoMode()) {
        return demoWrite((rows) => applyDelete(rows, payload), onStatus);
      }
      if (readyAccount == null) return Promise.reject(new Error(SIGNER_NOT_READY));
      return deleteMerchant({ context: writeContext(readyAccount), payload, onStatus });
    },
    onSuccess: invalidateRegistry,
  });
}

/** True when the signed-in account can submit registry writes. */
export function useCanWriteMerchants(): boolean {
  const readyAccount = useSessionStore((s) => s.readyAccount);
  return isDemoMode() || readyAccount != null;
}
