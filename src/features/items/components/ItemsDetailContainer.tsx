/**
 * Detail-view container for the Items tab.
 *
 * Receives the parent's `useItemConfigs` hook plus a navigation API and
 * stitches together the per-row actions so `ItemsTab.tsx` can stay
 * focused on routing between views. Clipboard state comes from
 * `useFeedback()`.
 */

import { useFeedbackStore } from "@shared/store/use-feedback-store.ts";
import { Icon } from "@shared/components/Icon.tsx";
import { AGhost } from "@shared/components/primitives.tsx";
import type { ItemConfig } from "@features/items/items-model.ts";
import { findItemInConfig } from "@features/items/items-model.ts";
import type { UseItemConfigsResult } from "@features/items/item-configs.ts";
import { ItemsDetail } from "./ItemsDetail.tsx";

export interface ItemsDetailContainerProps {
  config: ItemConfig | null;
  items: UseItemConfigsResult;
  onBack: () => void;
  onDuplicateOpen: (sourceId: string) => void;
  onItemFormOpen: (
    args:
      | { kind: "new"; configId: string }
      | { kind: "edit"; configId: string; itemId: string },
  ) => void;
}

export function ItemsDetailContainer({
  config,
  items,
  onBack,
  onDuplicateOpen,
  onItemFormOpen,
}: ItemsDetailContainerProps) {
  const copyValue = useFeedbackStore((s) => s.copyValue);

  if (!config) {
    return (
      <>
        <AGhost onClick={onBack}>
          <Icon name="chevron-left" size={14} /> Back
        </AGhost>
      </>
    );
  }

  const snapshot = items.publishedSnapshots.get(config.id) ?? null;

  return (
    <ItemsDetail
      config={config}
      publishedSnapshot={snapshot}
      onBack={onBack}
      onCopyId={() => copyValue(config.id, `config:${config.id}`)}
      onAddItem={() => onItemFormOpen({ kind: "new", configId: config.id })}
      onEditItem={(itemId) => {
        if (!findItemInConfig(config, itemId)) return;
        onItemFormOpen({ kind: "edit", configId: config.id, itemId });
      }}
      onDeleteItem={(itemId) => {
        void items.deleteItem(config.id, itemId);
      }}
      onDuplicate={() => onDuplicateOpen(config.id)}
      onDeleteConfig={async () => {
        const res = await items.deleteConfig(config.id);
        if (res.ok) onBack();
      }}
      onSave={() => void items.saveConfig(config.id)}
      saving={items.publishInFlight}
    />
  );
}
