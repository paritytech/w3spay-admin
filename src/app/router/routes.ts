// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { TabItem } from "@shared/components/primitives.tsx";

export type TabId =
  | "merchants"
  | "items"
  | "restaurants"
  | "payment-processors"
  | "balances"
  | "reports"
  | "account";

export const TABS: ReadonlyArray<TabItem<TabId>> = [
  { id: "merchants", label: "Terminals", icon: "smartphone" },
  { id: "items", label: "Items", icon: "tag" },
  { id: "restaurants", label: "Restaurants", icon: "utensils" },
  { id: "payment-processors", label: "Processors", icon: "cpu" },
  { id: "balances", label: "Balances", icon: "wallet" },
  { id: "reports", label: "Reports", icon: "bar-chart" },
  { id: "account", label: "Account", icon: "user" },
];

export const TAB_DEFAULT_PATH: Record<TabId, string> = {
  merchants: "/merchants",
  items: "/items",
  restaurants: "/restaurants",
  "payment-processors": "/payment-processors",
  balances: "/balances",
  reports: "/reports",
  account: "/account",
};
