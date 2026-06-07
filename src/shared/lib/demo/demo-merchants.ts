/**
 * Synthetic merchant fixtures used in demo mode.
 *
 * Spans the cross-product of:
 *   - kind         — POS terminals and T3rminal devices
 *   - lifecycle    — active, paused, revoked
 *   - display name — present, blank, mixed-case
 *
 * Every t3rminal-kind row uses the canonical `T3RMINAL_TERMINAL_ID_PREFIX`
 * + lowercase destination hex form so `merchantKindFromTerminalId()`
 * resolves correctly and the Reports tab knows which rows are real
 * T3rminals.
 *
 * Timestamps are spread across the last week so `timeAgoFromIso()` and
 * the Balances "Recent activity" sort produce a recognisable order.
 *
 * Keys are computed via the same `computeTerminalKey` keccak the
 * contract uses, so derived helpers (route params, `MerchantDetail`
 * lookup) match real on-chain behaviour exactly.
 */
import {
  T3RMINAL_TERMINAL_ID_PREFIX,
  computeTerminalKey,
  t3rminalTerminalIdForDestination,
  type RegistryMerchantRow,
} from "@features/merchant/merchant-model.ts";
import { type AccountId32Hex, normalizeAccountId32Hex } from "@shared/lib/address.ts";

const DEMO_MERCHANT_ID = "demo-pilot";

// Distinct, well-formed 32-byte AccountId32 hex destinations. The
// trailing `…0001..` pattern is purely cosmetic; what matters is that
// each is 64 lowercase hex digits and unique.
const DEMO_DESTINATIONS = [
  "0xa1c7b1fb6c2d8e1d5a9c4f0e7d6b8a3c1e2f4b6d8a0c2e4f6a8c0e2d4b6a8c01",
  "0xb2d6c0fa5b1c7d2e6a8d3e1f9c4b7a2d0e1f3a5c7b9d1e3f5a7b9c1e3d5b7a02",
  "0xc3e5d1f9a0b6c1e2d7b9c4e0f3a6b1c8d2e0f5a4b6c8d0e2f4a6b8c0e2d4b603",
  "0xd4f4e208b9a5b0c2e6d8b3c5d1e2f7a0b9c1d3e5a7b9c1d3e5a7c9d1e3a5c704",
  "0xe5a3f317c8b4a9b1d5e7b2c6e0f3a5b8c1d2f4e6a8b0c2d4e6a8b0c2e4d6b805",
  "0xf6b2a426d7c3a8b0e4d6c1b5f0e2a4b7c0d1e3f5a7c9b1d3e5a7c9b1d3e5a706",
] as const;

interface SeedSpec {
  readonly merchantId: string;
  readonly terminalId: string;
  readonly destinationAccountId: AccountId32Hex;
  readonly displayName: string;
  readonly status: RegistryMerchantRow["status"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const dest = (index: number): AccountId32Hex =>
  normalizeAccountId32Hex(DEMO_DESTINATIONS[index]!);

function t3rTerminalId(index: number): string {
  return t3rminalTerminalIdForDestination(dest(index));
}

const SPECS: ReadonlyArray<SeedSpec> = [
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: "pos-01",
    destinationAccountId: dest(0),
    displayName: "Funkhaus · Bar East",
    status: "active",
    createdAt: "2026-05-20T18:42:00Z",
    updatedAt: "2026-05-26T22:10:00Z",
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: "pos-02",
    destinationAccountId: dest(1),
    displayName: "Funkhaus · Café",
    status: "active",
    createdAt: "2026-05-19T10:05:00Z",
    updatedAt: "2026-05-26T09:00:00Z",
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: "pos-03",
    destinationAccountId: dest(2),
    displayName: "",
    status: "paused",
    createdAt: "2026-05-15T15:30:00Z",
    updatedAt: "2026-05-24T11:45:00Z",
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: t3rTerminalId(3),
    destinationAccountId: dest(3),
    displayName: "T3rminal · Bookshop",
    status: "active",
    createdAt: "2026-05-18T08:15:00Z",
    updatedAt: "2026-05-27T07:00:00Z",
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: t3rTerminalId(4),
    destinationAccountId: dest(4),
    displayName: "",
    status: "active",
    createdAt: "2026-05-22T17:25:00Z",
    updatedAt: "2026-05-26T19:30:00Z",
  },
  {
    merchantId: DEMO_MERCHANT_ID,
    terminalId: t3rTerminalId(5),
    destinationAccountId: dest(5),
    displayName: "T3rminal · Old Festival Booth",
    status: "revoked",
    createdAt: "2026-04-10T12:00:00Z",
    updatedAt: "2026-05-01T20:00:00Z",
  },
];

export const DEMO_MERCHANT_SEED: ReadonlyArray<RegistryMerchantRow> = SPECS.map(
  (spec): RegistryMerchantRow => ({
    key: computeTerminalKey(spec.merchantId, spec.terminalId),
    merchantId: spec.merchantId,
    terminalId: spec.terminalId,
    destinationAccountId: spec.destinationAccountId,
    displayName: spec.displayName,
    status: spec.status,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
  }),
);

export const DEMO_MERCHANT_ID_DEFAULT = DEMO_MERCHANT_ID;

/** Re-exported for convenience so `demo-actions.ts` can stamp new t3rminal rows. */
export { T3RMINAL_TERMINAL_ID_PREFIX };
