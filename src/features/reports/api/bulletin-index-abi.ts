/**
 * Hand-maintained TypeScript mirror of `T3rminalBulletinIndex`'s ABI.
 *
 * The contract source is `apps/t3rminal-v1/contracts/src/T3rminalBulletinIndex.sol`;
 * the equivalent compiled JSON is checked in at
 * `apps/t3rminal-v1/lib/contracts/T3rminalBulletinIndex.json`. Mirroring
 * by hand keeps the admin app independent of that workspace's build
 * artifacts and lets us strip everything except the four view methods +
 * one event the Reports surface actually uses.
 *
 * The shape is `const`-frozen so it round-trips through `ethers.Interface`
 * with its widest possible static type — exactly the same convention as
 * `registry-abi.ts`.
 *
 * Drift is guarded by `tests/bulletin-index-abi.test.ts`, which encodes
 * each entry through `ethers.Interface` and asserts the selectors don't
 * collide with `W3SPayMerchantRegistryABI`.
 */

export const T3rminalBulletinIndexABI = [
  // ── Views ────────────────────────────────────────────────────────
  {
    inputs: [{ internalType: "bytes32", name: "shopKey", type: "bytes32" }],
    name: "getAllDates",
    outputs: [{ internalType: "string[]", name: "", type: "string[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "shopKey", type: "bytes32" },
      { internalType: "string", name: "date", type: "string" },
    ],
    name: "getMetadata",
    outputs: [
      {
        components: [
          { internalType: "string", name: "cid", type: "string" },
          { internalType: "uint256", name: "entryCount", type: "uint256" },
          { internalType: "uint256", name: "publishedAt", type: "uint256" },
          { internalType: "bool", name: "exists", type: "bool" },
        ],
        internalType: "struct IT3rminalBulletinIndex.DayMetadata",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "shopKey", type: "bytes32" },
      { internalType: "string", name: "date", type: "string" },
    ],
    name: "getCID",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "shopKey", type: "bytes32" }],
    name: "getReportCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // ── Event — kept for completeness; admin doesn't subscribe today ──
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "shopKey", type: "bytes32" },
      { indexed: true, internalType: "string", name: "date", type: "string" },
      { indexed: false, internalType: "string", name: "cid", type: "string" },
      { indexed: false, internalType: "uint256", name: "entryCount", type: "uint256" },
      { indexed: false, internalType: "address", name: "writer", type: "address" },
    ],
    name: "DailyReportStored",
    type: "event",
  },
] as const;
