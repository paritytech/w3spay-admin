/**
 * Seed item-catalogue data for the in-memory mock store.
 *
 * Boots the local draft layer into a recognisable state when the
 * registry is empty. Once `useItemConfigs` resolves published Bulletin
 * configs from the contract, those replace the seed; this file is a
 * fallback, not a default.
 *
 * Items are flat — no categories — matching the QR-payload contract
 * shipped to T3rminal devices.
 */

import type { ItemConfig } from "./items-model.ts";

export const ITEM_CONFIGS_SEED: ReadonlyArray<ItemConfig> = [
  {
    id: "bar",
    name: "Bar",
    updatedAt: "2026-05-05T18:20:00Z",
    items: [
      { id: "sku-001", name: "Tequila Shot", price: 4.0 },
      { id: "sku-008", name: "Jägermeister", price: 4.0 },
      { id: "sku-005", name: "Aperol Spritz", price: 8.5 },
      { id: "sku-006", name: "Negroni", price: 9.0 },
      { id: "sku-002", name: "Margherita", price: 10.0 },
      { id: "sku-003", name: "Pils 0.5L", price: 5.0 },
      { id: "sku-004", name: "Helles 0.3L", price: 4.0 },
      { id: "sku-007", name: "Club Mate", price: 3.5 },
      { id: "sku-009", name: "Water 0.5L", price: 2.5 },
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant",
    updatedAt: "2026-05-04T11:00:00Z",
    items: [
      { id: "sku-104", name: "Linsensuppe", price: 6.0 },
      { id: "sku-105", name: "Salat des Hauses", price: 11.0 },
      { id: "sku-101", name: "Schnitzel mit Kartoffelsalat", price: 16.0 },
      { id: "sku-102", name: "Currywurst", price: 7.5 },
      { id: "sku-103", name: "Pierogi (8 Stück)", price: 9.0 },
      { id: "sku-106", name: "Bratkartoffeln", price: 5.5 },
    ],
  },
  {
    id: "cafe",
    name: "Café",
    updatedAt: "2026-05-06T08:10:00Z",
    items: [
      { id: "sku-201", name: "Espresso", price: 2.2 },
      { id: "sku-202", name: "Cappuccino", price: 3.8 },
      { id: "sku-203", name: "Flat White", price: 4.2 },
      { id: "sku-204", name: "Filter Coffee", price: 3.0 },
      { id: "sku-207", name: "Matcha Latte", price: 4.8 },
      { id: "sku-205", name: "Croissant", price: 2.8 },
      { id: "sku-206", name: "Kuchen (slice)", price: 4.5 },
    ],
  },
  {
    id: "books",
    name: "Bookshop",
    updatedAt: "2026-04-29T16:45:00Z",
    items: [
      { id: "sku-301", name: "Paperback", price: 14.0 },
      { id: "sku-302", name: "Hardcover", price: 24.0 },
      { id: "sku-303", name: "Magazine", price: 8.0 },
      { id: "sku-304", name: "Postcard", price: 2.0 },
    ],
  },
];
