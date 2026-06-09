// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { TxStatus } from "@/shared/chain/contracts/index.ts";
import type { AdminMerchant } from "@features/merchant/merchant-model.ts";
import type { Restaurant } from "@features/restaurants/restaurants.ts";

import type { ProcessorTerminalForm } from "./payment-processor-model.ts";

export type UnlockState = "checking" | "locked" | "loading" | "ready";

export interface ConfigEditorApi {
  readonly unlock: UnlockState;
  readonly groupId: string;
  readonly initialGroupId: string | null;
  readonly terminals: ProcessorTerminalForm[];
  readonly passkey: string;
  readonly error: string | null;
  readonly generatingId: string | null;
  readonly showPasskey: boolean;
  readonly exportJson: string | null;
  readonly publishInFlight: boolean;
  readonly txStatus: TxStatus | null;
  readonly restaurantList: Restaurant[];
  readonly selectedRestaurant: Restaurant | null;
  readonly visibleMerchants: readonly AdminMerchant[];
  readonly publishedRecordReady: boolean;
  setPasskey(value: string): void;
  togglePasskey(): void;
  selectGroup(restaurant: Restaurant): void;
  isSelected(terminalId: string): boolean;
  toggleTerminal(merchant: AdminMerchant): Promise<void>;
  regenerateKey(terminalId: string): Promise<void>;
  onUnlock(): Promise<void>;
  onPublish(): Promise<void>;
  onExport(): void;
}
