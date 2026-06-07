/**
 * Merchant-registry write actions, backed by the TanStack Query cache.
 *
 * `useMerchantActions` builds the `MerchantRegistryActions` the
 * write-lifecycle hook (`useMerchantWrites`) drives. Each action performs
 * the chain write (or the demo reducer) and then invalidates the
 * merchant-registry query — replacing the former per-action
 * `refreshMerchantEntries()` coupling. The form/submit-state lifecycle
 * (validation, `submitState`, per-tx-status messages, toasts, telemetry)
 * stays in `useMerchantWrites`; this module is the cache-mutating layer.
 *
 * Demo mode is a branch here (not a separate provider): it mutates the
 * in-memory `demo-merchant-registry` via the pure `demo-actions` reducers
 * and invalidates, so the registry query re-reads the updated rows.
 */

import { useMemo } from "react";

import type { TxStatus } from "@/shared/chain/contracts/index.ts";

import { addMerchant } from "./add-merchant.ts";
import { deleteMerchant } from "./delete-merchant.ts";
import { setMerchantDestination } from "./set-merchant-destination.ts";
import { setMerchantStatus } from "./set-merchant-status.ts";
import { updateMerchant } from "./update-merchant.ts";
import type { MerchantRegistryActions } from "@features/merchant/merchant-registry-types.ts";
import type { RegistryMerchantRow } from "@features/merchant/merchant-model.ts";
import {
  applyDelete,
  applyRegister,
  applySetDestination,
  applySetStatus,
  applyUpdate,
  synthesizeTxHash,
} from "@shared/lib/demo/demo-actions.ts";
import { getDemoMerchantRows, setDemoMerchantRows } from "@shared/lib/demo/demo-merchant-registry.ts";
import { isDemoMode } from "@shared/lib/demo/demo-mode.ts";
import type { ReadyAdminAccount } from "@features/session/account.ts";
import { queryRoots } from "@shared/chain/keys.ts";
import { queryClient } from "@shared/chain/query-client.ts";

async function invalidateRegistry(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryRoots.merchantRegistry });
}

/**
 * Drive the standard `TxStatus` lifecycle on the next microtask so the
 * demo write's toast UI runs the same signing → finalized sequence a
 * real chain watcher emits.
 */
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
  await invalidateRegistry();
  return synthesizeTxHash();
}

async function chainWrite(write: () => Promise<string>): Promise<string> {
  const txHash = await write();
  await invalidateRegistry();
  return txHash;
}

/**
 * Build the registry write actions for the signed-in account, or `null`
 * when no account is ready (real mode) — `canWrite` derives from this.
 * Demo mode always returns actions (they mutate the in-memory bridge).
 */
export function useMerchantActions(
  account: ReadyAdminAccount | null,
): MerchantRegistryActions | null {
  return useMemo<MerchantRegistryActions | null>(() => {
    if (isDemoMode()) {
      return {
        registerMerchant: (payload, onStatus) =>
          demoWrite((rows) => applyRegister(rows, payload, Date.now()), onStatus),
        updateMerchant: (payload, onStatus) =>
          demoWrite((rows) => applyUpdate(rows, payload, Date.now()), onStatus),
        deleteMerchant: (payload, onStatus) =>
          demoWrite((rows) => applyDelete(rows, payload), onStatus),
        setMerchantStatus: (payload, onStatus) =>
          demoWrite((rows) => applySetStatus(rows, payload, Date.now()), onStatus),
        setMerchantDestination: (payload, onStatus) =>
          demoWrite((rows) => applySetDestination(rows, payload, Date.now()), onStatus),
      };
    }
    if (account == null) return null;
    const context = { signer: account.signer, walletAddress: account.ss58Address };
    return {
      registerMerchant: (payload, onStatus) =>
        chainWrite(() => addMerchant({ context, payload, onStatus })),
      updateMerchant: (payload, onStatus) =>
        chainWrite(() => updateMerchant({ context, payload, onStatus })),
      deleteMerchant: (payload, onStatus) =>
        chainWrite(() => deleteMerchant({ context, payload, onStatus })),
      setMerchantStatus: (payload, onStatus) =>
        chainWrite(() => setMerchantStatus({ context, payload, onStatus })),
      setMerchantDestination: (payload, onStatus) =>
        chainWrite(() => setMerchantDestination({ context, payload, onStatus })),
    };
  }, [account]);
}
