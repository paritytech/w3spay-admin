# W3SPay Merchant Registry — contracts

Nested Hardhat workspace for the on-chain merchant directory consumed by
W3SPay products. The contract maps a durable `(merchantId, terminalId)`
identity to a canonical `bytes32 destinationAccountId`, optional
`displayName`, lifecycle `status`, and `addedAt` / `updatedAt` timestamps.
Admins manage entries through the Hardhat CLI scripts in this directory.

- Chain: Paseo Next V2 Asset Hub by default (`paseo-next-v2`), pallet-revive.
- Contract source: `src/W3SPayRegistry.sol`.
- Interface: `src/interfaces/IW3SPayRegistry.sol`.
- Tests: `test/W3SPayRegistry.test.ts` (in-memory hardhat network — no Paseo connection needed).
- Deployment: `scripts/deploy-registry.ts` (`Revive.instantiate_with_code` through PAPI).

This package has its own `node_modules/` and `package-lock.json`. Bootstrap it:

```sh
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
| `owner` | Constructor seeds this to the deployer. `transferOwnership` rotates. | Transfer ownership; is implicitly a super admin and admin. |
| `super-admin` | `owner`, or another super admin via `addSuperAdmin`. | Everything an admin can, plus grant/revoke admins and super admins. |
| `admin` | A super admin via `addAdmin`. | Register / update / revoke / pause / reactivate / hard-delete merchant rows. |

`owner` cannot be demoted from any role — that protects against locking
yourself out by mistake. Use `transferOwnership` to hand the contract over.
Every super admin is always an admin too, so `removeSuperAdmin` only demotes a
super admin back to a normal admin (row-write access is kept); to revoke fully,
call `removeSuperAdmin` first and then `removeAdmin`.

The admin web app shows each connected user's H160 grant address. Any registry
super admin (the deployer/owner is the first) grants that address with
`w3spay-add-registry-admin.ts`, or promotes a new super admin with
`w3spay-add-registry-super-admin.ts`.

---

## One-time setup

Set `DEPLOYER_SEED` once, in the **repo-root `.env.local`** (one level up from
`contracts/` — there is no `contracts/.env` anymore). The deployer must be funded
on the target Asset Hub and becomes the contract `owner` + first admin via its
pallet-revive H160 address.

```sh
# In ../.env.local (the repo root):
DEPLOYER_SEED="twelve or twenty-four word mnemonic ..."
```

Or run `npm run setup` from the repo root — it prompts for the seed and writes it.

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

The deployer compiles the Hardhat artifact, derives an sr25519 signer from
`DEPLOYER_SEED`, ensures the Substrate account is mapped, dry-runs
`ReviveApi.instantiate`, then submits `pallet_revive::instantiate_with_code`.

The script writes:

```sh
deployments/<network>/deployed_addresses.json
deployments/<network>/deployment.json
../.env.local              # the admin app
```

Both the admin app and, when a w3spay cashier app is checked out alongside
it, that app's `.env.local` receive:

```sh
VITE_NETWORK=<network>
VITE_W3SPAY_REGISTRY_ADDRESS=0x...
```

This keeps admin and consumer on the same on-chain registry without a manual
copy step. If the cashier app isn't present, the script logs a `Skipped:`
warning instead of failing.

Contract storage layout changed when lifecycle status and AccountId32
merchant destinations were added. Existing deployments are not upgradeable
in place: deploy a fresh registry and update every product environment
that reads it.

Every admin script accepts `W3SPAY_REGISTRY_ADDRESS` as the script-specific
registry override. When it is unset, scripts fall back to the latest
`VITE_W3SPAY_REGISTRY_ADDRESS` from the repo-root `.env.local`.

---

## Scripts

All registry scripts are PAPI-first and use the same `NETWORK` / `--env`
selection model as the deployer. They load the repo-root `../.env.local`
(then `../.env`), so a fresh deployment's `VITE_W3SPAY_REGISTRY_ADDRESS` is
picked up automatically. Prefer either `NETWORK=previewnet npm run ...` or
`npm run ... -- --env previewnet` when selecting a network through npm. The
scripts also tolerate npm's warning-producing `npm run ... --env previewnet`
form by treating the forwarded positional network key as the selected network.
Script-specific inputs are passed through `W3SPAY_*` environment variables or
equivalent CLI flags. The convention is `W3SPAY_<FLAG_NAME>` with dashes
upper-cased to underscores (e.g. `--merchant-id` → `W3SPAY_MERCHANT_ID`).

### Register a new merchant terminal

```sh
export W3SPAY_MERCHANT_ID=demo-merchant
export W3SPAY_TERMINAL_ID=register-01
export W3SPAY_DESTINATION=0x0000000000000000000000001234567890abcdef1234567890abcdef12345678
export W3SPAY_DISPLAY_NAME="Demo Store"   # optional
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
export W3SPAY_MERCHANT_ID=demo-merchant
export W3SPAY_TERMINAL_ID=register-01
export W3SPAY_DESTINATION=0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd
export W3SPAY_DISPLAY_NAME="Demo Store v2"           # optional
npm run registry:update
```

Same inputs as register. Preserves `addedAt` and current `status`; bumps
`updatedAt`. Reverts with `Unknown merchant` if the `(merchantId,
terminalId)` pair was never registered.

### Pause, revoke, or reactivate a merchant

```sh
export W3SPAY_MERCHANT_ID=demo-merchant
export W3SPAY_TERMINAL_ID=register-01
export W3SPAY_STATUS=paused                        # active | paused | revoked
npm run registry:set-status
```

`W3SPAY_STATUS` accepts `active`, `paused`, or `revoked`. Use `revoked` for
normal lifecycle removal so the terminal remains visible in the admin
directory. `active` reactivates a paused or revoked terminal.

### Hard-delete a merchant entry

```sh
export W3SPAY_MERCHANT_ID=demo-merchant
export W3SPAY_TERMINAL_ID=register-01
npm run registry:remove
```

Wipes the row and removes it from the enumeration. The `(merchantId,
terminalId)` pair can be re-registered afterwards. This is operator cleanup;
normal admin flows should use `W3SPAY_STATUS=revoked` instead.

### Grant another H160 address admin role (super-admin-only)

```sh
export W3SPAY_REGISTRY_ADDRESS=0xabc...
export W3SPAY_ADMIN=0xabc...
npm run registry:add-admin
```

To target a non-default network, set `NETWORK` or pass `--env` through npm:

```sh
NETWORK=previewnet npm run registry:add-admin
npm run registry:add-admin -- --env previewnet
```

Idempotent — if the address is already admin, the script returns early
without sending a transaction. Reverts on a non-super-admin caller.

### Grant super admin role (super-admin-only)

```sh
export W3SPAY_REGISTRY_ADDRESS=0xabc...
export W3SPAY_SUPER_ADMIN=0xabc...
npm run registry:add-super-admin
```

Promotes the address to super admin **and** seeds the admin role (every super
admin is an admin). Idempotent — returns early without a transaction if the
address is already a super admin. Reverts on a non-super-admin caller.

There is no removal script. To demote, call `removeSuperAdmin` (drops to a
normal admin) and then `removeAdmin` (revokes fully) from a hardhat console:

```sh
npx hardhat console --network paseoAssetHub
```

```js
> const Registry = await ethers.getContractAt("W3SPayRegistry", process.env.W3SPAY_REGISTRY_ADDRESS)
> const feeData = await ethers.provider.getFeeData()
> const gasPrice = feeData.gasPrice ? feeData.gasPrice * 10n : 10_000_000_000_000n
> await Registry.removeSuperAdmin("0xTarget", { gasPrice, gasLimit: 500000n })
> await Registry.removeAdmin("0xTarget", { gasPrice, gasLimit: 500000n })
```

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
   cd contracts
   export W3SPAY_REGISTRY_ADDRESS=0x...
   export W3SPAY_MERCHANT_ID=demo-bakery
   export W3SPAY_TERMINAL_ID=register-01
   export W3SPAY_DESTINATION=0x0000000000000000000000001234567890abcdef1234567890abcdef12345678
   export W3SPAY_DISPLAY_NAME="Demo Bakery"
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
> const Registry = await ethers.getContractAt("W3SPayRegistry", process.env.W3SPAY_REGISTRY_ADDRESS)
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
| `isSuperAdmin read reverted` during an admin grant | The script is pointed at the wrong registry address, often from a stale exported `VITE_W3SPAY_REGISTRY_ADDRESS` | Set `W3SPAY_REGISTRY_ADDRESS=0x...` to the registry printed by setup, then re-run. |
| `Status unchanged` | Status script requested the row's current lifecycle state | Pick a different status or skip the write. |
| `Merchant exists` | The `(merchantId, terminalId)` pair is already registered | Use `w3spay-update-merchant.ts` to change destination / displayName, or `w3spay-set-merchant-status.ts` for lifecycle changes. |

---

## File map

```text
contracts/
├── src/
│   ├── W3SPayRegistry.sol          contract implementation
│   └── interfaces/IW3SPayRegistry.sol
├── test/
│   └── W3SPayRegistry.test.ts      hardhat-toolbox cases
├── ignition/modules/
│   └── W3SPayRegistry.ts           legacy Ignition module, not the default deploy path
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
