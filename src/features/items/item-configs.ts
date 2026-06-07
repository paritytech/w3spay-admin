import type { ReadyAdminAccount } from "@features/session/account.ts";
import type { ItemConfigRegistryRecord } from "@features/items/contracts/item-configs-read.ts";
import type { ItemConfigWriteActions } from "@features/items/contracts/item-config-writes.ts";
import type { PublishedConfigSnapshot } from "./item-config-drafts.ts";
import type { Item, ItemConfig } from "./items-model.ts";
import type { MutationError, MutationResult } from "./items-mutations.ts";
import type { UpsertItemArgs } from "./items-item-mutations.ts";

export type PublishProgress =
  | { kind: "idle" }
  | { kind: "running"; current: string; remaining: number }
  | { kind: "success"; configIds: ReadonlyArray<string> }
  | { kind: "error"; configId: string; reason: string };

export type SaveAllResult =
  | { ok: true; configIds: ReadonlyArray<string> }
  | { ok: false; error: { configId: string; reason: string } };

export interface UseItemConfigsOptions {
  readonly account: ReadyAdminAccount | null;
}

export interface UseItemConfigsResult {
  configs: ReadonlyArray<ItemConfig>;
  publishedSnapshots: ReadonlyMap<string, PublishedConfigSnapshot>;
  publishedRegistry: ReadonlyArray<ItemConfigRegistryRecord>;
  dirtyConfigIds: ReadonlyArray<string>;
  writeInFlight: boolean;
  publishInFlight: boolean;
  publishProgress: PublishProgress;
  registryLoaded: boolean;
  lastError: MutationError | null;
  createConfig: (args: { name: string; id: string }) => Promise<MutationResult>;
  duplicateConfig: (sourceId: string, args: { name: string; id: string }) => Promise<MutationResult>;
  deleteConfig: (id: string) => Promise<MutationResult<{ id: string }>>;
  upsertItem: (configId: string, args: UpsertItemArgs) => Promise<MutationResult<Item>>;
  deleteItem: (configId: string, itemId: string) => Promise<MutationResult>;
  saveAllChanged: () => Promise<SaveAllResult>;
  saveConfig: (configId: string) => Promise<SaveAllResult>;
  refreshPublishedRegistry: () => Promise<void>;
  resetError: () => void;
}

export type { ItemConfigWriteActions };
