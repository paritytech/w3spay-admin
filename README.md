# W3sPay Admin Prototype

> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

This is code developed and published by Parity as an experimental proof-of-concept. It is **not** a Parity product or service, and Parity does not operate, host, deploy, or endorse any downstream deployment of it — downstream operators run their own forks at their own discretion.

Mobile-first admin console for the W3sPay payment surface. The app manages merchant terminals, item configurations, restaurants (on-chain merchant profiles), encrypted payment-processor configs (published to Bulletin, CID-indexed on the registry), balances, and transaction reports from inside a Polkadot host container, with a standalone browser mode for development and design review.

## Getting Started

### Deploy

```bash
npm install
cp .env.example .env.local        # set MNEMONIC and confirm VITE_* values
npm run deploy                    # publishes the configured .dot product
```

See **[DEPLOY.md](./DEPLOY.md)** for the deploy process: environment setup, publishing the SPA, and fresh registry deployment.

### Contracts

```bash
cd contracts
npm install
cp .env.example .env              # set DEPLOYER_SEED
npm run compile
npm test
npm run deploy:paseo-next-v2
```

The deployer writes the registry address back to `../.env.local`.

### Frontend (local dev)

```bash
npm install
cp .env.example .env.local        # then set VITE_* values
npm run dev                       # http://localhost:5175
```


## Admin Access Process

1. Open the admin app inside the Polkadot host.
2. The first screen shows your **account address** with a **Copy address** button. This is the canonical pallet-revive H160 form of your product account.
3. Copy the address and send it, out-of-band, to the registry owner.
4. The owner grants access:

   ```bash
   cd contracts
   cp .env.example .env            # set DEPLOYER_SEED for the owner account
   export W3SPAY_ADMIN=0x...
   npm run registry:add-admin
   # Non-default network:
   NETWORK=previewnet npm run registry:add-admin
   # or: npm run registry:add-admin -- --env previewnet
   ```

5. Back in the app, tap **Check again**. Once `isAdmin(yourH160)` returns `true`, the admin console renders.

   Alternatively, the registry **owner** can grant several admins at once from
   the app: **Account → Registry admins** (one H160 per line; idempotent).


## Security

Before deploying it for real use cases, you are responsible for:

- Reviewing the code yourself; this is a reference proof-of-concept, not a hardened production build.
- Checking that dependencies are up to date and free of known vulnerabilities.
- Securing your own fork or deployment environment, especially mnemonics, CI secrets, registry ownership, and DotNS ownership.
- Tracking the latest tagged release / commits for security fixes; older releases are not backported (exceptions might apply).

For Parity's security disclosure process and Bug Bounty program, see [parity.io/bug-bounty](https://parity.io/bug-bounty).

## License

Licensed under [GPL-3.0-or-later](./LICENSE). Solidity contracts under `contracts/` are licensed under [MIT](./contracts/LICENSE) (see their SPDX headers).
