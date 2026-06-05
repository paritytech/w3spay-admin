/**
 * Shared types for the merchants-list subfolder: status filter + sort
 * vocabulary. Lives in its own module so leaf components import only
 * what they need.
 */

import type { MerchantStatus } from "@shared/components/tokens.ts";

export type StatusFilter = "all" | MerchantStatus;
export type MerchantSort = "recent" | "name";
