# W3SPay Merchant Registry — contracts

Nested Hardhat workspace for the on-chain merchant directory consumed by
W3SPay products. The contract maps a durable `(merchantId, terminalId)`
identity to a canonical `bytes32 destinationAccountId`, optional
`displayName`, lifecycle `status`, and `addedAt` / `updatedAt` timestamps.
Admins manage entries through the Hardhat CLI scripts in this directory.

- Chain: Paseo Next V2 Asset Hub by default (`paseo-next-v2` in `../src/host/networks.ts`), pallet-revive.
- Contract source: `src/W3SPayMerchantRegistry.sol`.
- Interface: `src/interfaces/IW3SPayMerchantRegistry.sol`.
- Tests: `test/W3SPayMerchantRegistry.test.ts` (in-memory hardhat network — no Paseo connection needed).
- Deployment: `scripts/deploy-registry.ts` (`Revive.instantiate_with_code` through PAPI).

This package has its own `node_modules/` and `package-lock.json`; it is
**not** part of the root npm workspace glob. Bootstrap separately:

```sh
cd apps/w3spay-admin/contracts
npm install
```

---

## Registry data model

| Field | Notes |
|---|---|
| `merchantId` | Stable merchant handle. |
| `terminalId` | Register / till identifier. Together with `merchantId` forms the durable key. |
| `destinationAccountId` | Canonical 32-byte payout account (`bytes32`). Use raw AccountId32 when possible. Legacy H160 revive destinations are normalized as `0x00 × 12 ‖ H160`. |
| `displayName` | Optional display label. Empty string is allowed. |
| `status` | `Active`, `Paused`, or `Revoked`. Registered merchants default to `Active`. |
| `addedAt` / `updatedAt` | Unix seconds. `updatedAt` changes on destination/display/status updates. |

The contract intentionally does **not** store payment aggregates, FX rates,
venue, city, or receipt/TSE metadata. Those belong to a separate source.

---

## Roles

| Role | Granted by | Can do |
|---|---|---|
| `owner` | Constructor seeds this to the deployer. `transferOwnership` rotates. | Grant/revoke admin, transfer ownership. Is implicitly an admin too. |
| `admin` | `owner` via `addAdmin`. | Register / update / revoke / pause / reactivate / hard-delete merchant rows. |

`owner` cannot remove itself from the admin set — that protects against
locking yourself out by mistake. Use `transferOwnership` to hand the
contract over.

The admin web app shows each connected user's H160 grant address. The
contract owner grants that address with `w3spay-add-registry-admin.ts`.

---

## One-time setup

Set the deployer / admin mnemonic once. The deployer must be funded on the
target Asset Hub and will become the contract `owner` + first admin via its
pallet-revive H160 address.

```sh
cd apps/w3spay-admin/contracts
cp .env.example .env
# edit DEPLOYER_SEED="twelve or twenty-four word mnemonic ..."
```

Verify everything builds and the test suite is green before you deploy:

```sh
npm run compile
npm test
```

---

## Deploy

Default target is `paseo-next-v2`, matching the admin app network registry:

```sh
npm run deploy
# explicit equivalent:
npm run deploy:paseo-next-v2
```

The deployer uses the same model as `w3s-conference-app`: compile the
Hardhat artifact, derive an sr25519 signer from `DEPLOYER_SEED`, ensure the
Substrate account is mapped, dry-run `ReviveApi.instantiate`, then submit
`pallet_revive::instantiate_with_code`.

The script writes:

```sh
contracts/deployments/<network>/deployed_addresses.json
contracts/deployments/<network>/deployment.json
../.env.local              # apps/w3spay-admin/.env.local
../../w3spay/.env.local    # apps/w3spay/.env.local (sibling consumer app)
```

Both `.env.local` files receive:

```sh
VITE_NETWORK=<network>
VITE_W3SPAY_REGISTRY_ADDRESS=0x...
```

Writing both keeps the admin and the consumer (`apps/w3spay`) on the
same on-chain registry without a manual copy step. When the w3spay app
isn't present at this checkout the deploy script logs a `Skipped:`
warning instead of failing, so a stripped tree (e.g. CI that only
pulled the admin) still deploys cleanly.
Contract storage layout changed when lifecycle status and AccountId32
merchant destinations were added. Existing deployments are not upgradeable
in place: deploy a fresh registry and update every product environment
that reads it.

Every admin script reads `W3SPAY_REGISTRY_ADDRESS` from the env so the
deployed address is never baked into source.

---

## Scripts

All registry scripts are PAPI-first and use the same `NETWORK` / `--env`
selection model as the deployer. They load `contracts/.env` and
`../.env.local`, so a fresh deployment's `VITE_W3SPAY_REGISTRY_ADDRESS` is
picked up automatically. Script-specific inputs are passed through
`W3SPAY_*` environment variables or equivalent CLI flags. The convention is
`W3SPAY_<FLAG_NAME>` with dashes upper-cased to underscores
(e.g. `--merchant-id` → `W3SPAY_MERCHANT_ID`).

### Register a new merchant terminal

```sh
export W3SPAY_MERCHANT_ID=funkhaus
export W3SPAY_TERMINAL_ID=bar-east-01
export W3SPAY_DESTINATION=0x0000000000000000000000001234567890abcdef1234567890abcdef12345678
export W3SPAY_DISPLAY_NAME="Bar East (Funkhaus)"   # optional
npm run registry:register
```

| Env var | Required | Notes |
|---|---|---|
| `W3SPAY_MERCHANT_ID` | yes | Stable short handle. |
| `W3SPAY_TERMINAL_ID` | yes | Register / till identifier. Together with `W3SPAY_MERCHANT_ID` forms the durable on-chain key. |
| `W3SPAY_DESTINATION` | yes | Preferred: 0x-prefixed AccountId32 (32 bytes). A 20-byte H160 is accepted and normalized to `0x00 × 12 ‖ H160`. |
| `W3SPAY_DISPLAY_NAME` | no | Optional display label. Empty allowed. |

Registered merchants start as `Active`.

Reverts on:
- non-admin caller (`Not admin`),
- duplicate `(merchantId, terminalId)` (`Merchant exists`),
- empty merchantId / terminalId (`Empty merchantId` / `Empty terminalId`),
- zero destination (`Zero destination`).

### Update an existing merchant's destination or displayName

```sh
export W3SPAY_MERCHANT_ID=funkhaus
export W3SPAY_TERMINAL_ID=bar-east-01
export W3SPAY_DESTINATION=0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd
export W3SPAY_DISPLAY_NAME="Bar East v2"           # optional
npm run registry:update
```

Same inputs as register. Preserves `addedAt` and current `status`; bumps
`updatedAt`. Reverts with `Unknown merchant` if the `(merchantId,
terminalId)` pair was never registered.

### Pause, revoke, or reactivate a merchant

```sh
export W3SPAY_MERCHANT_ID=funkhaus
export W3SPAY_TERMINAL_ID=bar-east-01
export W3SPAY_STATUS=paused                        # active | paused | revoked
npm run registry:set-status
```

`W3SPAY_STATUS` accepts `active`, `paused`, or `revoked`. Use `revoked` for
normal lifecycle removal so the terminal remains visible in the admin
directory. `active` reactivates a paused or revoked terminal.

### Hard-delete a merchant entry

```sh
export W3SPAY_MERCHANT_ID=funkhaus
export W3SPAY_TERMINAL_ID=bar-east-01
npm run registry:remove
```

Wipes the row and removes it from the enumeration. The `(merchantId,
terminalId)` pair can be re-registered afterwards. This is operator cleanup;
normal admin flows should use `W3SPAY_STATUS=revoked` instead.

### Grant another H160 address admin role (owner-only)

```sh
export W3SPAY_ADMIN=0xabc...
npm run registry:add-admin
```

Idempotent — if the address is already admin, the script returns early
without sending a transaction. Reverts on non-owner caller.

### List the current table (read-only)

```sh
npm run registry:list
```

Dumps version, count, and every row in chain enumeration order, including
`destinationAccountId` and lifecycle status.

---

## End-to-end: adding a new merchant

1. **Register the destination on chain.**

   ```sh
   cd apps/w3spay-admin/contracts
   export W3SPAY_REGISTRY_ADDRESS=0x...
   export W3SPAY_MERCHANT_ID=demo-bakery
   export W3SPAY_TERMINAL_ID=register-01
   export W3SPAY_DESTINATION=0x0000000000000000000000001234567890abcdef1234567890abcdef12345678
   export W3SPAY_DISPLAY_NAME="APL Demo Bakery (Berlin)"
   npm run registry:register
   ```

2. **Update product configuration** that references the registry address.
   The admin app lists every registry row. The cashier app may also keep
   bundled offline metadata for receipt/TSE mapping.

3. **Verify** with `npm run registry:list` and product boot inside the host.

---

## Rotating a TSE

This is **not** a chain operation. The on-chain key is `(merchantId,
terminalId)` — the TSE serial number lives in cashier metadata. To rotate,
edit the product metadata and redeploy the SPA. The on-chain destination
and lifecycle status are preserved.

---

## Transferring ownership

There is no dedicated script — `transferOwnership` is direct enough to
call inline. From a hardhat console:

```sh
npx hardhat console --network paseoAssetHub
```

```js
> const Registry = await ethers.getContractAt("W3SPayMerchantRegistry", process.env.W3SPAY_REGISTRY_ADDRESS)
> const feeData = await ethers.provider.getFeeData()
> const gasPrice = feeData.gasPrice ? feeData.gasPrice * 10n : 10_000_000_000_000n
> await Registry.transferOwnership("0xNewOwner", { gasPrice, gasLimit: 500000n })
```

The new owner is automatically added to the admin set so the role split
keeps working even if the previous owner removes itself later.

---

## Item-config CID records

In addition to merchant rows, the registry contract also holds the CID
record for every item-config payload published to Bulletin Chain. The
record stores only the canonical CID, byte size, and last-updated
timestamp — Bulletin Chain inclusion coordinates are not tracked here
because publishing is delegated to the host (Polkadot Desktop / dotli)
via `preimageManager.submit`, and the host owns the chain account that
would do any future renewal. The same admin set authorises both
surfaces — there is no second permission to provision.

### Upsert (create or update) an item-config CID record

```sh
export W3SPAY_CONFIG_ID=bar
export W3SPAY_CONFIG_CID=bafkrei...
export W3SPAY_CONFIG_SIZE=412
npm run registry:upsert-item-config
```

| Env var | Required | Notes |
|---|---|---|
| `W3SPAY_CONFIG_ID` | yes | Logical id consumed by terminals; matches the local draft id. |
| `W3SPAY_CONFIG_CID` | yes | Raw-codec CIDv1 with Blake2b-256 multihash (what Bulletin indexes). |
| `W3SPAY_CONFIG_SIZE` | yes | Envelope byte length. Must fit in a `uint32` and be > 0. |

Reverts on:
- non-admin caller (`Not admin`),
- empty `W3SPAY_CONFIG_ID` (`Empty configId`),
- empty `W3SPAY_CONFIG_CID` (`Empty cid`),
- `W3SPAY_CONFIG_SIZE=0` (`Zero size`).

### List published item-config CID records

```sh
npm run registry:list-item-configs
```

Prints version, count, and every `(configId, cid, size, updatedAt)` row
in chain enumeration order.

### Solidity surface (per-config records)

```solidity
struct ItemConfigRecord {
    string configId;
    string cid;
    uint32 size;
    uint64 updatedAt;
    bool exists;
}

event ItemConfigUpserted(string configId, string cid, uint32 size);
event ItemConfigRemoved(string configId);

function upsertItemConfig(string calldata configId, string calldata cid, uint32 size) external;
function removeItemConfig(string calldata configId) external;
function getItemConfig(string calldata configId) external view returns (ItemConfigRecord memory);
function getAllItemConfigIds() external view returns (string[] memory);
function getItemConfigCount() external view returns (uint256);
```

All writes are `onlyAdmin`; the shared `version` counter bumps on every
mutation so off-chain clients can invalidate either domain through the
existing version polling logic.

Existing deployments are not upgradeable in place — adding the
item-config surface shifts the storage layout. Redeploy with
`npm run deploy:paseo-next-v2` and update every product environment
that reads it.
---

## Local development

The hardhat tests cover the contract surface without touching Paseo:

```sh
npm test
# or with coverage
npm run test:coverage
```

The registry maintenance scripts target real pallet-revive chains through PAPI.
For local-only contract behavior, use the Hardhat test suite; do not use the
PAPI maintenance scripts against `hardhat node`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Not admin` revert on a register/update/status/remove call | Signer H160 is not in the `admins` mapping | Run `npm run registry:add-admin` from the owner mnemonic, then re-run. |
| `Not owner` revert on `addAdmin` / `transferOwnership` | `DEPLOYER_SEED` does not derive the owner H160 | Use the owner mnemonic, or transfer ownership from the current owner. |
| `Set W3SPAY_REGISTRY_ADDRESS …` | Registry env var missing | Set `W3SPAY_REGISTRY_ADDRESS=0x...` or run `npm run deploy` so `.env.local` gets `VITE_W3SPAY_REGISTRY_ADDRESS`. |
| `Status unchanged` | Status script requested the row's current lifecycle state | Pick a different status or skip the write. |
| `Merchant exists` | The `(merchantId, terminalId)` pair is already registered | Use `w3spay-update-merchant.ts` to change destination / displayName, or `w3spay-set-merchant-status.ts` for lifecycle changes. |

---

## File map

```text
contracts/
├── src/
│   ├── W3SPayMerchantRegistry.sol          contract implementation
│   └── interfaces/IW3SPayMerchantRegistry.sol
├── test/
│   └── W3SPayMerchantRegistry.test.ts      hardhat-toolbox cases
├── ignition/modules/
│   └── W3SPayMerchantRegistry.ts           legacy Ignition module, not the default deploy path
├── scripts/
│   ├── deploy-registry.ts                  PAPI pallet-revive deployment
│   ├── lib/
│   │   ├── argv.ts                         minimal --flag=value parser
│   │   ├── destination.ts                  AccountId32 parse + status helpers
│   │   └── revive.ts                       PAPI signer/read/write helpers
│   ├── w3spay-register-merchant.ts
│   ├── w3spay-update-merchant.ts
│   ├── w3spay-set-merchant-status.ts
│   ├── w3spay-remove-merchant.ts
│   ├── w3spay-add-registry-admin.ts
│   └── w3spay-list-merchants.ts
├── hardhat.config.ts                       local tests + legacy EVM RPC config
├── tsconfig.json
└── package.json
```
