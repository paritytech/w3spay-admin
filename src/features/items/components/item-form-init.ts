/**
 * Pure derivations of the Items-tab form state from the active route.
 *
 * `ItemsTab` fully remounts on every intra-tab navigation — the screen
 * wrapper in `App.tsx` keys on `routeAnimationKey(route)`, so each
 * edit / new / duplicate screen mounts a *fresh* `ItemsTab` whose
 * `useState` runs from scratch. That makes the route the single source
 * of truth for the initial form contents: seeding state from these
 * helpers in the `useState` initializer guarantees the fields are
 * populated on mount, mirroring how the merchant edit form seeds local
 * state from its data prop.
 *
 * The previous approach threaded the values through navigation
 * callbacks (`setItemForm(form); navigate(...)`). That silently lost
 * them — the setter ran on the *outgoing* `ItemsTab` instance, which
 * unmounted the moment the route (and therefore the screen key)
 * changed, so the incoming instance always started blank.
 */

import type { ItemsView } from "@features/items/pages/ItemsTab.tsx";
import { findItemInConfig, type ItemConfig } from "@features/items/items-model.ts";
import { BLANK_ITEM_FORM, type ItemFormState } from "./ItemsItemForm.tsx";
import { BLANK_NEW_CONFIG, type NewConfigForm } from "./ItemsNewConfig.tsx";

/**
 * Initial item-form fields for the current route: the target item's
 * SKU / name / price in edit mode, blank otherwise (new item, or the
 * id is absent because the route raced a delete).
 */
export function itemFormForRoute(
  view: ItemsView,
  configs: ReadonlyArray<ItemConfig>,
): ItemFormState {
  if (view.kind !== "item-edit") return BLANK_ITEM_FORM;
  const config = configs.find((c) => c.id === view.configId);
  const item = config ? findItemInConfig(config, view.itemId) : null;
  if (!item) return BLANK_ITEM_FORM;
  return { id: item.id, name: item.name, price: item.price.toString() };
}

/**
 * Initial duplicate-config form for the current route — pre-fills the
 * "(copy)" display name and slug from the source config. Blank when the
 * route is not a duplicate, or the source config has gone away.
 */
export function duplicateFormForRoute(
  view: ItemsView,
  configs: ReadonlyArray<ItemConfig>,
): NewConfigForm {
  if (view.kind !== "duplicate") return BLANK_NEW_CONFIG;
  const source = configs.find((c) => c.id === view.sourceId);
  if (!source) return BLANK_NEW_CONFIG;
  return { name: `${source.name} (copy)`, id: `${source.id}-copy` };
}
