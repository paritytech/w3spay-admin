# Deploy

One command takes the admin SPA from a fresh checkout to a live `.dot` product:

```bash
npm install                  # once
cp .env.example .env.local   # set your secrets (see table below)
npm run setup                # guided deploy
```

`npm run setup` is an interactive wizard that runs the whole pipeline from a
single repo-root `.env.local`: **environment** (Node ≥ 22, `bulletin-deploy`) →
**configure** (network, domain, registry, publish-to-Browse, secrets — written back to
`.env.local`) → **readiness** (Asset Hub RPC reachable, deployer funded) →
**registry** (deployed via pallet-revive **only when** `.env.local` has no valid
`VITE_W3SPAY_REGISTRY_ADDRESS`) → **admins** (optional grants) → **build &
publish** (`deploy.sh` → `bulletin-deploy`). Re-running reuses the registry
address recorded in `.env.local`, so a redeploy of the app alone is just
`npm run setup` again.

## Prerequisites

- Node ≥ 22
- `bash` — POSIX only (macOS / Linux). The wizard spawns `bash deploy.sh` and `npm`.
- `bulletin-deploy` ≥ 0.10.0 on `PATH` (`npm install -g bulletin-deploy@latest`). Not needed with `--skip-app`.

## Environment (single file: `.env.local`)

Everything lives in the gitignored repo-root `.env.local` — **never commit secrets**.

| Variable | Required | Notes |
| --- | --- | --- |
| `DEPLOYER_SEED` | yes | sr25519 12/24-word mnemonic. Its pallet-revive H160 becomes the registry owner + first admin. |
| `MNEMONIC` or `DOTNS_MNEMONIC` | yes | 12/24-word publisher phrase. If both are set they must match. |
| `VITE_DOTNS_PRODUCT_DOMAIN` | yes | Target domain, e.g. `w3spayadmin.dot` (also `--domain` / first deploy.sh arg). |
| `VITE_NETWORK` | no | `paseo` \| `paseo-next-v2` \| `previewnet`. Defaults to `paseo-next-v2`. |
| `VITE_W3SPAY_REGISTRY_ADDRESS` | no | The `W3SPayRegistry` H160. Written by the wizard / registry deploy; set it by hand to reuse an existing contract. |
| `VITE_T3RMINAL_BULLETIN_INDEX_ADDRESS` | no | Reports surface; leave empty to disable Reports. |
| `VITE_CHAIN_GENESIS_HASH` | previewnet only | Runtime-supplied genesis for frequently-rebuilt networks. |
| `BULLETIN_DEPLOY_PUBLISH` | no | `true` = list the `.dot` in the on-chain Publisher registry (the Browse directory) via `--publish`. Default `false` = upload only. |

The wizard writes `VITE_NETWORK`, `VITE_DOTNS_PRODUCT_DOMAIN`, and (after a fresh
deploy) `VITE_W3SPAY_REGISTRY_ADDRESS` back into `.env.local`. Prompted secrets
are saved only if you opt in.

## Flags

`npm run setup -- <flags>`:

| Flag | Effect |
| --- | --- |
| `--network <key>` (`--env <key>`) | `paseo` \| `paseo-next-v2` \| `previewnet`. |
| `--domain <name[.dot]>` | Target domain; `.dot` is appended if missing. |
| `--publish` / `--no-publish` | List (or not) the `.dot` in the on-chain Publisher registry — the Browse directory (`paseo-next-v2` only). Default: the saved/`.env` value, else off. |
| `--yes` (`-y`, `--non-interactive`) | No prompts. Every required value must come from `.env.local`/flags. |
| `--dry-run` | Run environment + configure + readiness checks only. Writes nothing. |
| `--fresh-registry` | Deploy a new registry even if `.env.local` already records one. |
| `--skip-app` | Stop after the registry; do not build/publish the SPA. |

Non-interactive example (CI / scripted):

```bash
npm run setup -- --network paseo-next-v2 --yes
```

Preflight without touching anything:

```bash
npm run setup -- --dry-run
```

## Manual steps (advanced)

The wizard orchestrates two workhorses you can still run directly. Both now read
the repo-root `.env.local` — **there is no `contracts/.env` anymore**. If you are
upgrading an old checkout, move `DEPLOYER_SEED` from `contracts/.env` into the
repo-root `.env.local`.

```bash
# App only — build + publish (resolves registry/mnemonic/domain from .env.local):
npm run deploy
npm run deploy -- mydomain.dot       # override the domain for one run

# Registry only — deploy a fresh W3SPayRegistry (reads DEPLOYER_SEED from .env.local):
npm run deploy --prefix contracts
NETWORK=previewnet npm run deploy --prefix contracts   # pick a network

# Grant an admin (any super admin's mnemonic; the deployer/owner is the first super admin):
W3SPAY_REGISTRY_ADDRESS=0x... W3SPAY_ADMIN=0x... npm run registry:add-admin --prefix contracts
```

The registry deploy upserts `VITE_NETWORK` + `VITE_W3SPAY_REGISTRY_ADDRESS` into
`.env.local` (and a sibling `../w3spay/.env.local` when present).

Result of a publish: `https://<name>.dot.li`

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Deployer … has 0 PAS` / readiness block | Fund the deployer on the target network: `https://faucet.polkadot.io/` (select "Paseo Asset Hub"). |
| `bulletin-deploy not found` / `< 0.10.0` | `npm install -g bulletin-deploy@latest`. |
| previewnet genesis mismatch | Set `VITE_CHAIN_GENESIS_HASH=0x…` in `.env.local` (previewnet is rebuilt frequently). |
| `Interactive prompt … without a TTY` | Run with `--yes` and set every required value in `.env.local`. |
| `DEPLOYER_SEED is not set …` | Add it to the repo-root `.env.local` (only needed for a fresh registry). |
