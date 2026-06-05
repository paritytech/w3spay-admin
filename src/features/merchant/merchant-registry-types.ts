import type {
  AdminMerchant,
  MerchantForm,
  MerchantFormErrors,
  MerchantKind,
} from "./merchant-model.ts";
import type { TxStatus } from "@/shared/api/contracts/index.ts";
import type { AddMerchantPayload } from "@features/merchant/api/add-merchant.ts";
import type { DeleteMerchantPayload } from "@features/merchant/api/delete-merchant.ts";
import type { SetMerchantStatusPayload } from "@features/merchant/api/set-merchant-status.ts";
import type { UpdateMerchantPayload } from "@features/merchant/api/update-merchant.ts";
import type { SetMerchantDestinationPayload } from "@features/merchant/api/set-merchant-destination.ts";

// ── Registry contract write actions ──────────────────────────────────────

export interface MerchantRegistryActions {
  registerMerchant(
    payload: AddMerchantPayload,
    onStatus?: (status: TxStatus) => void,
  ): Promise<string>;
  updateMerchant(
    payload: UpdateMerchantPayload,
    onStatus?: (status: TxStatus) => void,
  ): Promise<string>;
  deleteMerchant(
    payload: DeleteMerchantPayload,
    onStatus?: (status: TxStatus) => void,
  ): Promise<string>;
  setMerchantStatus(
    payload: SetMerchantStatusPayload,
    onStatus?: (status: TxStatus) => void,
  ): Promise<string>;
  setMerchantDestination(
    payload: SetMerchantDestinationPayload,
    onStatus?: (status: TxStatus) => void,
  ): Promise<string>;
}

// ── Write-lifecycle types ─────────────────────────────────────────────────

export type SubmitState = "idle" | "signing" | "submitting" | "finalized" | "error";

export interface UseMerchantWritesResult {
  writeInFlight: boolean;
  submitState: SubmitState;
  submitMessage: string | null;
  registerMerchant(
    form: MerchantForm,
    setErrors: (e: MerchantFormErrors) => void,
    kind?: MerchantKind,
  ): Promise<string | null>;
  setMerchantStatus(
    merchant: AdminMerchant,
    action: "pause" | "resume" | "revoke" | "reinstate",
    target: "active" | "paused" | "revoked",
  ): Promise<void>;
  setMerchantDestination(
    merchant: AdminMerchant,
    destinationInput: string,
    setError: (message: string | null) => void,
  ): Promise<boolean>;
  deleteMerchant(merchant: AdminMerchant): Promise<boolean>;
  resetSubmit(): void;
}
