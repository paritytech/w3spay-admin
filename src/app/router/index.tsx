// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Hash history is REQUIRED — the admin console runs inside the dotli
 * iframe, the Polkadot Desktop webview, and as an installed PWA, none of
 * which can drive path-based history reliably.
 */

import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

import { queryClient } from "@shared/chain/query-client.ts";
import { RootLayout } from "./layouts.tsx";
import { AuthedLayout } from "./guards.tsx";
import { AdminAccountCard } from "@features/session/pages/AdminAccess.tsx";
import { Balances } from "@features/balances/pages/Balances.tsx";
import { ConfigureT3rminalRoute } from "@features/merchant/pages/ConfigureT3rminal.tsx";
import { ItemsTab } from "@features/items/pages/ItemsTab.tsx";
import { MerchantDetailRoute } from "@features/merchant/pages/MerchantDetail.tsx";
import { MerchantEditDestinationRoute } from "@features/merchant/pages/MerchantEditDestination.tsx";
import { MerchantNew } from "@features/merchant/pages/MerchantNew.tsx";
import { MerchantNewPicker } from "@features/merchant/pages/MerchantNewPicker.tsx";
import { MerchantsList } from "@features/merchant/pages/MerchantsList.tsx";
import { Reports } from "@features/reports/pages/Reports.tsx";
import { ReportsTerminal } from "@features/reports/pages/ReportsTerminal.tsx";
import { ReportsProcessorGroup } from "@features/reports/pages/ReportsProcessorGroup.tsx";
import { Restaurants } from "@features/restaurants/pages/Restaurants.tsx";
import { PaymentProcessors } from "@features/payment-processors/pages/PaymentProcessors.tsx";
import { useSessionStore } from "@features/session/store/use-session-store.ts";

const rootRoute = createRootRoute({ component: RootLayout });

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authed",
  component: AuthedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/merchants" });
  },
});

const merchantsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants",
  component: MerchantsList,
  staticData: { tab: "merchants", showTabs: true },
});

const merchantNewPickerRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants/new",
  component: MerchantNewPicker,
  staticData: { tab: "merchants", showTabs: false },
});

const merchantNewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants/new/$mode",
  staticData: { tab: "merchants", showTabs: false },
  component: function MerchantNewModeRoute() {
    const { mode } = merchantNewRoute.useParams();
    return <MerchantNew mode={mode === "pos" || mode === "t3rminal" ? mode : "pos"} />;
  },
});

const merchantDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants/$merchantKey",
  staticData: { tab: "merchants", showTabs: false },
  component: function MerchantDetailRouteWrap() {
    const { merchantKey } = merchantDetailRoute.useParams();
    return <MerchantDetailRoute merchantKey={merchantKey} />;
  },
});

const merchantConfigureRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants/$merchantKey/configure",
  staticData: { tab: "merchants", showTabs: false },
  component: function MerchantConfigureRoute() {
    const { merchantKey } = merchantConfigureRoute.useParams();
    return <ConfigureT3rminalRoute merchantKey={merchantKey} />;
  },
});

const merchantEditDestinationRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/merchants/$merchantKey/edit-destination",
  staticData: { tab: "merchants", showTabs: false },
  component: function MerchantEditDestinationRouteWrap() {
    const { merchantKey } = merchantEditDestinationRoute.useParams();
    return <MerchantEditDestinationRoute merchantKey={merchantKey} />;
  },
});

const itemsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items",
  staticData: { tab: "items", showTabs: true },
  component: () => <ItemsTab view={{ kind: "list" }} />,
});

const itemsNewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items/new",
  staticData: { tab: "items", showTabs: true },
  component: () => <ItemsTab view={{ kind: "new" }} />,
});

const itemsDuplicateRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items/duplicate/$sourceId",
  staticData: { tab: "items", showTabs: true },
  component: function ItemsDuplicateRoute() {
    const { sourceId } = itemsDuplicateRoute.useParams();
    return <ItemsTab view={{ kind: "duplicate", sourceId }} />;
  },
});

const itemsDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items/$configId",
  staticData: { tab: "items", showTabs: true },
  component: function ItemsDetailRoute() {
    const { configId } = itemsDetailRoute.useParams();
    return <ItemsTab view={{ kind: "detail", configId }} />;
  },
});

const itemsItemNewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items/$configId/items/new",
  staticData: { tab: "items", showTabs: true },
  component: function ItemsItemNewRoute() {
    const { configId } = itemsItemNewRoute.useParams();
    return <ItemsTab view={{ kind: "item-new", configId }} />;
  },
});

const itemsItemEditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/items/$configId/items/$itemId/edit",
  staticData: { tab: "items", showTabs: true },
  component: function ItemsItemEditRoute() {
    const { configId, itemId } = itemsItemEditRoute.useParams();
    return <ItemsTab view={{ kind: "item-edit", configId, itemId }} />;
  },
});

const restaurantsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/restaurants",
  staticData: { tab: "restaurants", showTabs: true },
  component: () => <Restaurants view={{ kind: "list" }} />,
});

const restaurantsNewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/restaurants/new",
  staticData: { tab: "restaurants", showTabs: true },
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    const from = search.from;
    return typeof from === "string" && from !== "" ? { from } : {};
  },
  component: function RestaurantsNewRoute() {
    const { from } = restaurantsNewRoute.useSearch();
    return <Restaurants view={{ kind: "new", from }} />;
  },
});

const restaurantsEditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/restaurants/$restaurantId",
  staticData: { tab: "restaurants", showTabs: true },
  component: function RestaurantsEditRoute() {
    const { restaurantId } = restaurantsEditRoute.useParams();
    return <Restaurants view={{ kind: "edit", restaurantId }} />;
  },
});

const paymentProcessorsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/payment-processors",
  staticData: { tab: "payment-processors", showTabs: true },
  component: () => <PaymentProcessors view={{ kind: "list" }} />,
});

const paymentProcessorsNewRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/payment-processors/new",
  staticData: { tab: "payment-processors", showTabs: true },
  component: () => <PaymentProcessors view={{ kind: "new" }} />,
});

const paymentProcessorsEditRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/payment-processors/$groupId",
  staticData: { tab: "payment-processors", showTabs: true },
  component: function PaymentProcessorsEditRoute() {
    const { groupId } = paymentProcessorsEditRoute.useParams();
    return <PaymentProcessors view={{ kind: "edit", groupId }} />;
  },
});

const balancesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/balances",
  component: Balances,
  staticData: { tab: "balances", showTabs: true },
});

const reportsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/reports",
  component: Reports,
  staticData: { tab: "reports", showTabs: true },
});

const reportsTerminalRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/reports/$merchantKey",
  staticData: { tab: "reports", showTabs: false },
  component: function ReportsTerminalRoute() {
    const { merchantKey } = reportsTerminalRoute.useParams();
    return <ReportsTerminal merchantKey={merchantKey} />;
  },
});

// Static `processors` segment — outranks the `$merchantKey` param above.
const reportsProcessorGroupRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/reports/processors/$groupId",
  staticData: { tab: "reports", showTabs: false },
  component: function ReportsProcessorGroupRoute() {
    const { groupId } = reportsProcessorGroupRoute.useParams();
    return <ReportsProcessorGroup groupId={groupId} />;
  },
});

const accountRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/account",
  staticData: { tab: "account", showTabs: true },
  component: function AccountRoute() {
    const readyAccount = useSessionStore((s) => s.readyAccount);
    if (readyAccount == null) return null;
    return (
      <>
        <AdminAccountCard identity={readyAccount} title="Signed-in admin account" />
  
      </>
    );
  },
});

const routeTree = rootRoute.addChildren([
  authedRoute.addChildren([
    indexRoute,
    merchantsRoute,
    merchantNewPickerRoute,
    merchantNewRoute,
    merchantDetailRoute,
    merchantConfigureRoute,
    merchantEditDestinationRoute,
    itemsRoute,
    itemsNewRoute,
    itemsDuplicateRoute,
    itemsDetailRoute,
    itemsItemNewRoute,
    itemsItemEditRoute,
    restaurantsRoute,
    restaurantsNewRoute,
    restaurantsEditRoute,
    paymentProcessorsRoute,
    paymentProcessorsNewRoute,
    paymentProcessorsEditRoute,
    balancesRoute,
    reportsRoute,
    reportsTerminalRoute,
    reportsProcessorGroupRoute,
    accountRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  context: { queryClient },
  defaultNotFoundComponent: () => {
    throw redirect({ to: "/merchants" });
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
