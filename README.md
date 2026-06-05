# W3sPay admin

Mobile-first pilot console for the W3sPay payment surface. The console
is a sandboxed PWA that deploys alongside `apps/w3spay` and runs inside
a Polkadot host container (dotli web iframe, Polkadot Desktop webview)
or standalone in a browser for design review.

Two tabs:

- **Merchants** — directory, register a new terminal, drill into a
  merchant to see its on-chain registration metadata, copy the payout
  AccountId32 destination, and pause / revoke / reinstate the terminal
  via real `setMerchantStatus` writes.
- **Balances** — registry coverage summary (active / paused / revoked
  counts), per-merchant directory list. Payment totals are intentionally
  absent because the registry contract does not store them; a separate
  payment-aggregate source is required.

Every screen is driven by the W3SPay merchant registry contract on
Paseo Asset Hub Next v2. The first paint is an **AdminAccess gate**: until the
connected product account's H160 address is granted via
`addAdmin(address)` on the registry, the console refuses to render.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_NETWORK` | yes | Chain key. Current pilot target: `paseo-next-v2`. |
| `VITE_W3SPAY_REGISTRY_ADDRESS` | yes | Deployed `W3SPayMerchantRegistry` contract address (H160) on that chain. |

Set it in `apps/w3spay-admin/.env.local`:

```bash
VITE_NETWORK=paseo-next-v2
VITE_W3SPAY_REGISTRY_ADDRESS=0xfec1497a5fbfc2583ea52bc7504701f95ea4a68a
```

The registry storage layout changed when lifecycle status and
AccountId32 destinations were added. Existing deployments are NOT
upgradeable; deploy a fresh contract from
`apps/w3spay-admin/contracts/` and update both the cashier and admin
env files.

## Admin access process

1. Open the admin app inside the Polkadot host.
2. The first screen shows your H160 admin grant address (the canonical
   pallet-revive form of your product account) plus the SS58 form for
   verification.
3. Copy the H160 address and send it, out-of-band, to the contract
   maintainer.
4. The maintainer runs:

   ```sh
   cd apps/w3spay-admin/contracts
   export W3SPAY_REGISTRY_ADDRESS=0x...
   npx hardhat run scripts/w3spay-add-registry-admin.ts --network paseoAssetHub -- \
     --admin=0xYourCopiedH160
   ```

5. Back in the app, tap **Check again**. Once `isAdmin(yourH160)`
   returns `true`, the admin console renders.

## Scripts

```bash
npm --workspace apps/w3spay-admin run dev        # http://localhost:5175
npm --workspace apps/w3spay-admin run build
npm --workspace apps/w3spay-admin run typecheck
npm --workspace apps/w3spay-admin run test       # vitest
npm --workspace apps/w3spay-admin run deploy     # publish as .dot product
```

## Layout

```
index.html                # PWA shell — viewport, theme-color, safe-area
src/
  App.tsx                 # root controller; access gate + admin console
  main.tsx                # ReactDOM bootstrap
  styles.css              # document chrome
  config.ts               # registry constants, address normalization helpers
  data/merchant-model.ts  # AdminMerchant model + format helpers
  host/
    chain-client.ts       # WS-direct PAPI client for Paseo Asset Hub
    host-connection.ts    # iframe/desktop detection + AccountsProvider singleton
    permissions.ts        # checkHostChainSupport + ChainSubmit helpers
    use-admin-account.ts  # requestLogin, product account → SS58 + H160 grant address
    use-terminal-store.ts # KvStore hook (host KV inside container, localStorage otherwise)
  host-environment.ts     # async KvStore adapter over @parity/product-sdk-host
  registry/
    registry-abi.ts       # ABI subset for the W3SPay registry
    onchain-loader.ts     # encode → ReviveApi.call dry-run → decode + cache
    contract-writer.ts    # registerMerchant / setMerchantStatus tx pipeline
    use-merchant-registry.ts  # discriminated read/write hook
  screens/
    AdminAccess.tsx       # first-paint access gate
    MerchantsList.tsx
    MerchantDetail.tsx
    MerchantNew.tsx
    Balances.tsx
  ui/
    tokens.ts, Icon.tsx, Mark.tsx, primitives.tsx, Toast.tsx
bundle/
  manifest.toml           # .dot product manifest (host extensions list)
deploy.sh                 # bulletin-deploy pipeline (mirrors apps/w3spay)
contracts/                # nested hardhat workspace (W3SPayMerchantRegistry)
```

## Registry data model

The console renders only what the contract exposes:

| Field | Source |
| --- | --- |
| `merchantId`, `terminalId` | on chain |
| `displayName` | on chain |
| `status` | on chain (`active` / `paused` / `revoked`) |
| `destinationAccountId` | on chain (canonical 32-byte `bytes32`) |
| Derived H160 | UI-only convenience, shown when the destination matches the `0x00 × 12 ‖ H160` convention |
| `createdAt`, `updatedAt` | on chain (Unix seconds → ISO) |

Payment aggregates (`receivedCASH`, payment counts, last-paid
timestamps), display-only metadata (`venue`, `city`), and live FX rates
are **not** in the registry and are not faked here. Wire a separate
source if you need them.

## Host / PWA deployment

The admin runs three ways:

- **Standalone browser** — `vite dev` for design review or local QA.
  Outside a host, the access gate uses browser wallet extensions such as
  Talisman or Polkadot.js.
- **dotli web iframe / phone host** — `detectHostEnvironment()` flips to
  `web-iframe`/`desktop-webview`; account requests use the same product-sdk
  `createAccountsProvider(sandboxTransport)` path as `apps/t3rminal-v1`.
  Registry reads/writes use the public Paseo Asset Hub WebSocket directly;
  signing still goes through the host product-account signer.

Deployment uses the same `bulletin-deploy` pipeline as apps/w3spay:

```bash
export DOTNS_MNEMONIC="…twelve or twenty-four words…"
npm run deploy:w3spay-admin                 # → https://w3spayadmin.dot.li
```

`bundle/manifest.toml` declares the host extensions the admin uses:
`host.data` (registry cache + admin preferences), `host.browser.bridge`
(sandboxed iframe/webview ↔ host account transport), and `host.api`
(runtime permission requests, e.g. `ChainSubmit`). The cashier-only
extensions — `host.coinpayment`, `host.media`, `host.balance` — are
intentionally omitted.

Chain reads and writes do **not** flow through the host PAPI provider.
The admin uses a direct WebSocket connection to Paseo Asset Hub, mirroring
the t3rminal-v1 workaround in `apps/t3rminal-v1/lib/host/provider.ts`
(`createPapiProvider` advertises `host_feature_supported=true` for Paseo
Asset Hub but never establishes a working `chainHead_v1_follow`). Signing
still goes through the host product-account signer.

## Runtime permissions

The Polkadot host exposes two permission surfaces — neither of which gates
chain reads:

- **Device permissions** (`requestDevicePermission`): Camera, Microphone,
  Notifications, Bluetooth, NFC, Location, Clipboard, OpenUrl, Biometrics.
  Not used by the admin app.
- **Remote permissions** (`requestPermission`): `Remote(origins)`,
  `WebRTC`, `ChainSubmit`, `PreimageSubmit`, `StatementSubmit`. There is
  no `ChainRead` / `ChainQuery` variant; chain reads are gated by the host
  advertising chain support via `host_feature_supported(Chain, …)`, not by
  any permission the app can request.

The admin app probes the host once at login (`src/host/permissions.ts`):

1. `checkHostChainSupport(PASEO_ASSET_HUB_GENESIS)` — informational. If
   the host does not advertise Paseo Asset Hub, a `console.info` line is
   emitted but the WS-direct provider keeps working.
2. `requestRemotePermission("ChainSubmit")` — eager. Surfaces denial in
   the AdminAccess gate before the user fills the new-merchant form. The
   gate exposes a `Re-request permission` affordance.

Defense-in-depth: `useMerchantRegistry` throws `ChainSubmitDeniedError` if
a write is invoked while the cached grant is `false`. The gate should
normally prevent this, but the throw guards against bypasses.
