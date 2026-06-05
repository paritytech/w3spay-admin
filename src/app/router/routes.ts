/**
 * Router-level metadata shared by the layouts, the gate, and the route
 * definitions.
 *
 * `TabId` is the top tab-bar identity; each route declares its owning tab
 * (and tab-bar visibility) via TanStack Router `staticData`. `TABS` is
 * the tab-bar item list and `TAB_DEFAULT_PATH` maps each tab to the path
 * a tab tap navigates to.
 */

import type { TabItem } from "@shared/components/primitives.tsx";

export type TabId =
  | "merchants"
  | "items"
  | "restaurants"
  | "balances"
  | "reports"
  | "account";

export const TABS: ReadonlyArray<TabItem<TabId>> = [
  { id: "merchants", label: "Merchants" },
  { id: "items", label: "Items" },
  { id: "restaurants", label: "Restaurants" },
  { id: "balances", label: "Balances" },
  { id: "reports", label: "Reports" },
  { id: "account", label: "Account" },
];

export const TAB_DEFAULT_PATH: Record<TabId, string> = {
  merchants: "/merchants",
  items: "/items",
  restaurants: "/restaurants",
  balances: "/balances",
  reports: "/reports",
  account: "/account",
};
