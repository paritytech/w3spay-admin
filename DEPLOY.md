# Deploy

Builds the admin SPA and publishes it as a `.dot` product via `bulletin-deploy`. Does NOT deploy the registry contract — see below when you need a fresh one.

## Prerequisites

- Node ≥ 22
- `npm install` (pins `bulletin-deploy@^0.10.0`; the script requires ≥ 0.10.0)

## Configure

```bash
cp .env.example .env.local
```

Set in `.env.local` (gitignored — never commit a mnemonic):

| Variable | Required | Notes |
| --- | --- | --- |
| `MNEMONIC` or `DOTNS_MNEMONIC` | yes | 12- or 24-word publisher phrase. If both set, must match. |
| `VITE_DOTNS_PRODUCT_DOMAIN` | yes | Target domain, e.g. `w3spayadmin.dot`. |
| `VITE_W3SPAY_REGISTRY_ADDRESS` | yes | Deployed `W3SPayRegistry` H160 — validated before the build. |
| `VITE_NETWORK` | no | Defaults to `BULLETIN_ENV` (`paseo-next-v2`). Must match it. |
| `VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS` | no | Empty disables Reports. |

## Deploy

```bash
npm run deploy
# or override the domain for one run:
npm run deploy -- mydomain.dot
```

The script validates the registry H160, builds, copies `bundle/manifest.toml` into `dist/`, and runs `bulletin-deploy --env paseo-next-v2`.

Result: `https://<name>.dot.li`

## Fresh registry contract (only when needed)

```bash
cd contracts
npm install
cp .env.example .env   # set DEPLOYER_SEED
npm run deploy:paseo-next-v2
```

Writes artifacts to `contracts/deployments/<network>/` and upserts `VITE_NETWORK` + `VITE_W3SPAY_REGISTRY_ADDRESS` into `../.env.local` (and a sibling `../w3spay/.env.local` if present). The deployer H160 becomes owner and first admin.

Grant more admins:

```bash
cd contracts
W3SPAY_ADMIN=0x... npm run registry:add-admin
```
