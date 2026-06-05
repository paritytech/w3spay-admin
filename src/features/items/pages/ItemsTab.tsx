/**
 * Items tab orchestrator.
 *
 * View-driven: receives the current view via the `view` prop and uses
 * `useNavigate()` from TanStack Router for transitions.
 * Form drafts (new-config, duplicate-config, item form) are local state.
 *
 * Mutations land in `useItemConfigs` which persists drafts via the host
 * KV store and exposes a `saveAllChanged` action that publishes every
 * locally-dirty config to Bulletin Chain and updates the registry
 * contract.
 */

import { useMemo, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@shared/components/Icon.tsx";
import { APrimary, ASecondary } from "@shared/components/primitives.tsx";
import { COLOR } from "@shared/components/tokens.ts";
import { useItemConfigs } from "@features/items/api/use-item-configs.ts";
import type { UseItemConfigsResult } from "@features/items/item-configs.ts";
import { ItemsList, ItemsListSkeleton } from "@features/items/components/ItemsList.tsx";
import { ItemsNewConfig, BLANK_NEW_CONFIG, type NewConfigForm } from "@features/items/components/ItemsNewConfig.tsx";
import { ItemsDuplicateConfig } from "@features/items/components/ItemsDuplicateConfig.tsx";
import {
  ItemsItemForm,
  BLANK_ITEM_FORM,
  type ItemFormState,
} from "@features/items/components/ItemsItemForm.tsx";
import { ItemsDetailContainer } from "@features/items/components/ItemsDetailContainer.tsx";
import { parsePriceInput } from "@features/items/items-model.ts";
import { errorMessage } from "@features/items/components/items-tab-errors.ts";
import { duplicateFormForRoute, itemFormForRoute } from "@features/items/components/item-form-init.ts";

export type ItemsView =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "duplicate"; sourceId: string }
  | { kind: "detail"; configId: string }
  | { kind: "item-new"; configId: string }
  | { kind: "item-edit"; configId: string; itemId: string };

export function ItemsTab({ view }: { view: ItemsView }) {
  const navigate = useNavigate();
  const items = useItemConfigs();
  const [newForm, setNewForm] = useState<NewConfigForm>(BLANK_NEW_CONFIG);
  const [duplicateForm, setDuplicateForm] = useState<NewConfigForm>(() =>
    duplicateFormForRoute(view, items.configs),
  );
  const [itemForm, setItemForm] = useState<ItemFormState>(() =>
    itemFormForRoute(view, items.configs),
  );

  const detailConfig = useMemo(
    () => (view.kind === "detail" ? items.configs.find((c) => c.id === view.configId) ?? null : null),
    [view, items.configs],
  );

  const goList = () => {
    navigate({ to: "/items" });
    items.resetError();
  };
  const withReset = <T,>(setter: (v: T) => void) => (next: T) => {
    setter(next);
    if (items.lastError) items.resetError();
  };

  if (view.kind === "list") {
    if (!items.registryLoaded) {
      return <ItemsListSkeleton />;
    }
    return (
      <>
        <ItemsList
          configs={items.configs}
          dirtyCount={items.dirtyConfigIds.length}
          onOpen={(id) => navigate({ to: "/items/$configId", params: { configId: id } })}
        />
        <div style={{ height: 14 }} />
        <SaveAllBlock items={items} />
        <div style={{ height: 10 }} />
        <APrimary
          onClick={() => {
            setNewForm(BLANK_NEW_CONFIG);
            items.resetError();
            navigate({ to: "/items/new" });
          }}
        >
          <Icon name="plus" size={14} /> New config
        </APrimary>
      </>
    );
  }

  if (view.kind === "new") {
    return (
      <ItemsNewConfig
        form={newForm}
        setForm={withReset(setNewForm)}
        error={errorMessage(items.lastError)}
        busy={items.writeInFlight}
        onBack={goList}
        onSubmit={async () => {
          const res = await items.createConfig(newForm);
          if (res.ok) {
            setNewForm(BLANK_NEW_CONFIG);
            navigate({ to: "/items/$configId", params: { configId: res.result.id } });
          }
        }}
      />
    );
  }

  if (view.kind === "duplicate") {
    const source = items.configs.find((c) => c.id === view.sourceId);
    if (!source) {
      goList();
      return null;
    }
    return (
      <ItemsDuplicateConfig
        source={source}
        form={duplicateForm}
        setForm={withReset(setDuplicateForm)}
        error={errorMessage(items.lastError)}
        busy={items.writeInFlight}
        onBack={() => navigate({ to: "/items/$configId", params: { configId: source.id } })}
        onSubmit={async () => {
          const res = await items.duplicateConfig(source.id, duplicateForm);
          if (res.ok) {
            setDuplicateForm(BLANK_NEW_CONFIG);
            navigate({ to: "/items/$configId", params: { configId: res.result.id } });
          }
        }}
      />
    );
  }

  if (view.kind === "item-new" || view.kind === "item-edit") {
    const configId = view.configId;
    const config = items.configs.find((c) => c.id === configId);
    if (!config) {
      goList();
      return null;
    }
    const back = () => navigate({ to: "/items/$configId", params: { configId } });
    const mode = view.kind === "item-new" ? "new" : "edit";
    return (
      <ItemsItemForm
        mode={mode}
        form={itemForm}
        setForm={withReset(setItemForm)}
        error={errorMessage(items.lastError)}
        busy={items.writeInFlight}
        onBack={back}
        onSubmit={async () => {
          const price = parsePriceInput(itemForm.price);
          if (price == null) return;
          const res = await items.upsertItem(config.id, {
            id: itemForm.id,
            name: itemForm.name,
            price,
          });
          if (res.ok) {
            setItemForm(BLANK_ITEM_FORM);
            back();
          }
        }}
        onDelete={
          view.kind === "item-edit"
            ? async () => {
                const res = await items.deleteItem(config.id, view.itemId);
                if (res.ok) back();
              }
            : undefined
        }
      />
    );
  }

  // items/detail
  return (
    <ItemsDetailContainer
      config={detailConfig}
      items={items}
      onBack={goList}
      onDuplicateOpen={(sourceId) => {
        items.resetError();
        navigate({ to: "/items/duplicate/$sourceId", params: { sourceId } });
      }}
      onItemFormOpen={(args) => {
        items.resetError();
        navigate(
          args.kind === "new"
            ? { to: "/items/$configId/items/new", params: { configId: args.configId } }
            : {
                to: "/items/$configId/items/$itemId/edit",
                params: { configId: args.configId, itemId: args.itemId },
              },
        );
      }}
    />
  );
}

function SaveAllBlock({ items }: { items: UseItemConfigsResult }) {
  const dirtyCount = items.dirtyConfigIds.length;
  const progress = items.publishProgress;
  const disabled = items.publishInFlight || dirtyCount === 0;

  const status = (() => {
    if (progress.kind === "running") {
      return `Publishing ${progress.current} · ${progress.remaining} remaining`;
    }
    if (progress.kind === "error") {
      return `Publish failed for ${progress.configId}: ${progress.reason}`;
    }
    if (progress.kind === "success" && progress.configIds.length > 0) {
      return `Published ${progress.configIds.length} config${progress.configIds.length === 1 ? "" : "s"}.`;
    }
    if (dirtyCount === 0 && items.registryLoaded) {
      return "All configs in sync with Bulletin Chain.";
    }
    if (dirtyCount > 0) {
      return `${dirtyCount} config${dirtyCount === 1 ? "" : "s"} with unsaved changes.`;
    }
    return null;
  })();

  return (
    <>
      <ASecondary onClick={() => void items.saveAllChanged()} disabled={disabled}>
        <Icon name="check" size={13} />{" "}
        {items.publishInFlight
          ? "Publishing…"
          : dirtyCount === 0
            ? "Nothing to publish"
            : `Save & publish ${dirtyCount} config${dirtyCount === 1 ? "" : "s"}`}
      </ASecondary>
      {status ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: progress.kind === "error" ? COLOR.redSoft : COLOR.text3,
            lineHeight: 1.5,
          }}
        >
          {status}
        </div>
      ) : null}
    </>
  );
}
