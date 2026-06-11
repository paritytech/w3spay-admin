/**
 * Guided one-command deploy for w3spay-admin.
 *
 * Runs the whole pipeline from a single repo-root `.env.local`:
 *   environment → configure → readiness → registry (only when needed) →
 *   optional admins → build + publish.
 *
 * `deploy.sh` (publish) and `contracts/scripts/deploy-registry.ts` (registry)
 * stay the workhorses; this wizard orchestrates them. POSIX only — it spawns
 * `bash deploy.sh` and `npm`.
 *
 *   npm run setup                         # interactive
 *   npm run setup -- --network paseo-next-v2 --yes   # non-interactive
 *   npm run setup -- --dry-run            # checks only, writes nothing
 */

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "polkadot-api";
import { getWsProvider } from "@polkadot-api/ws-provider";
import { AccountId } from "@polkadot-api/substrate-bindings";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { keccak256 } from "viem";

import {
  resolveNetwork,
  SUPPORTED_NETWORKS,
  type NetworkConfig,
} from "../src/shared/chain/host/networks";
import { loadEnvFile, readEnvKey, upsertEnvFile } from "./lib/env-files";
import * as ui from "./lib/ui";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const ENV_LOCAL = resolve(REPO_ROOT, ".env.local");
const ENV_FILE = resolve(REPO_ROOT, ".env");
const MIN_BULLETIN_DEPLOY = "0.10.0";
const FAUCET_HINT = 'https://faucet.polkadot.io/ (select "Paseo Asset Hub")';
const RPC_TIMEOUT_MS = 10_000;
const ONE_PAS = 10n ** 10n; // Asset Hub native token has 10 decimals (networks.ts).

export interface SetupFlags {
  network?: string;
  yes: boolean;
  dryRun: boolean;
  freshRegistry: boolean;
  skipApp: boolean;
  domain?: string;
  publish?: boolean;
}

interface Config {
  networkKey: string;
  network: NetworkConfig;
  domain: string;
  registryAddress?: `0x${string}`;
  deployRegistry: boolean;
  deployerSeed?: string;
  publishMnemonic?: string;
  publishToBrowse: boolean;
  persistSecrets: boolean;
}

/** A check the operator must fix before the deploy can proceed. */
class BlockedError extends Error {}

// ─── Pure helpers (unit-tested) ────────────────────────────────────────────

export function parseFlags(argv: string[]): SetupFlags {
  const flags: SetupFlags = { yes: false, dryRun: false, freshRegistry: false, skipApp: false };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case "--network":
      case "--env":
        flags.network = argv[i + 1];
        i += 1;
        break;
      case "--domain":
        flags.domain = argv[i + 1];
        i += 1;
        break;
      case "--yes":
      case "-y":
      case "--non-interactive":
        flags.yes = true;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--fresh-registry":
        flags.freshRegistry = true;
        break;
      case "--skip-app":
        flags.skipApp = true;
        break;
      case "--publish":
        flags.publish = true;
        break;
      case "--no-publish":
        flags.publish = false;
        break;
      default:
        break;
    }
  }
  return flags;
}

export function isValidRegistryAddress(v: string | undefined): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** Append `.dot` unless already suffixed (mirrors deploy.sh). */
export function normalizeDomain(v: string): string {
  return v.endsWith(".dot") ? v : `${v}.dot`;
}

export function withRegistryEnv(
  env: NodeJS.ProcessEnv,
  registryAddress: `0x${string}`,
): NodeJS.ProcessEnv {
  return {
    ...env,
    VITE_W3SPAY_REGISTRY_ADDRESS: registryAddress,
    W3SPAY_REGISTRY_ADDRESS: registryAddress,
  };
}

export function withRegistryGrantEnv(
  env: NodeJS.ProcessEnv,
  registryAddress: `0x${string}`,
  networkKey: string,
  deployerSeed: string,
  roleEnvKey: "W3SPAY_ADMIN" | "W3SPAY_SUPER_ADMIN",
  roleAddress: string,
): NodeJS.ProcessEnv {
  return withRegistryEnv(
    {
      ...env,
      NETWORK: networkKey,
      DEPLOYER_SEED: deployerSeed,
      [roleEnvKey]: roleAddress,
    },
    registryAddress,
  );
}

export function mnemonicWordCount(v: string): number {
  const trimmed = v.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Read a dotenv-style boolean: `true`/`1`/`yes` (case-insensitive) → true. */
export function parsePublishFlag(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function versionGte(current: string, minimum: string): boolean {
  const cur = current.split(".").map(Number);
  const min = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const a = cur[i] ?? 0;
    const b = min[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

function short(s: string): string {
  return s.length > 13 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

function formatPas(planck: bigint): string {
  const whole = planck / ONE_PAS;
  const frac = planck % ONE_PAS;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(10, "0").replace(/0+$/, "").slice(0, 4);
  return `${whole}.${fracStr}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), timeout]);
}

/** sr25519 → SS58 + pallet-revive H160 (mirrors contracts/scripts/deploy-registry.ts). */
function accountFromSeed(seed: string): { ss58: string; h160: `0x${string}` } {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(seed));
  const keyPair = sr25519CreateDerive(miniSecret)("");
  const hash = keccak256(keyPair.publicKey);
  return { ss58: AccountId(42).dec(keyPair.publicKey), h160: `0x${hash.slice(26)}` as `0x${string}` };
}

// ─── Phases ──────────────────────────────────────────────────────────────────

function phaseEnvironment(flags: SetupFlags): void {
  ui.heading("Environment");
  const blockers: string[] = [];
  const bulletinFix = "npm install -g bulletin-deploy@latest";

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor >= 22) ui.success(`Node ${process.versions.node}`);
  else {
    ui.error(`Node ${process.versions.node} — need >= 22`);
    blockers.push("Upgrade Node to >= 22.");
  }

  const probe = spawnSync("bulletin-deploy", ["--version"], { encoding: "utf8", stdio: "pipe" });
  const found = (probe.stdout ?? "").match(/([0-9]+)\.([0-9]+)\.([0-9]+)/)?.[0];
  if (probe.error || probe.status !== 0 || !found) {
    if (flags.skipApp) ui.warn(`bulletin-deploy not found — ignored (--skip-app). Install before publishing: ${bulletinFix}`);
    else {
      ui.error("bulletin-deploy not found on PATH");
      blockers.push(bulletinFix);
    }
  } else if (versionGte(found, MIN_BULLETIN_DEPLOY)) {
    ui.success(`bulletin-deploy ${found}`);
  } else if (flags.skipApp) {
    ui.warn(`bulletin-deploy ${found} < ${MIN_BULLETIN_DEPLOY} — ignored (--skip-app). ${bulletinFix}`);
  } else {
    ui.error(`bulletin-deploy ${found} < ${MIN_BULLETIN_DEPLOY}`);
    blockers.push(bulletinFix);
  }

  if (!existsSync(resolve(REPO_ROOT, "contracts", "node_modules"))) {
    ui.log(ui.c.dim("  contracts/node_modules absent — will install automatically if the registry is deployed."));
  }

  if (blockers.length) {
    throw new BlockedError(`Environment checks failed:\n${blockers.map((b) => `   - ${b}`).join("\n")}`);
  }
}

async function resolveNetworkKey(flags: SetupFlags): Promise<string> {
  let key = flags.network ?? process.env.VITE_NETWORK;
  if (!key) {
    if (flags.yes) key = "paseo-next-v2";
    else
      key = await ui.select(
        "Network",
        SUPPORTED_NETWORKS.map((k) => ({
          label: k,
          value: k,
          hint: k === "paseo-next-v2" ? "recommended" : undefined,
        })),
      );
  }
  if (!(SUPPORTED_NETWORKS as string[]).includes(key)) {
    throw new BlockedError(`Unknown network "${key}". Valid: ${SUPPORTED_NETWORKS.join(", ")}.`);
  }
  return key;
}

async function phaseConfigure(flags: SetupFlags): Promise<Config> {
  ui.heading("Configure");
  // process.env wins, so an exported shell var still overrides the files.
  loadEnvFile(ENV_LOCAL);
  loadEnvFile(ENV_FILE);

  const networkKey = await resolveNetworkKey(flags);
  let network: NetworkConfig;
  try {
    network = resolveNetwork(networkKey, {
      mainGenesisHash: process.env.VITE_CHAIN_GENESIS_HASH,
      bulletinGenesisHash: process.env.VITE_BULLETIN_GENESIS_HASH,
    });
  } catch (e) {
    throw new BlockedError((e as Error).message);
  }

  // Domain (optional only with --skip-app).
  let domain = "";
  const domainInput = flags.domain ?? process.env.VITE_DOTNS_PRODUCT_DOMAIN;
  if (domainInput) domain = normalizeDomain(domainInput);
  else if (!flags.skipApp) {
    if (flags.dryRun) {
      ui.warn("VITE_DOTNS_PRODUCT_DOMAIN not set — would block a real run.");
    } else if (flags.yes) {
      throw new BlockedError(
        "No target domain. Pass --domain <name> or set VITE_DOTNS_PRODUCT_DOMAIN in .env.local.",
      );
    } else {
      domain = normalizeDomain(
        await ui.text("Target .dot domain", {
          validate: (v) => (v.trim() ? null : "Enter a domain, e.g. w3spayadmin.dot"),
        }),
      );
    }
  }

  // Registry: reuse a valid recorded address unless --fresh-registry / declined.
  const existing = process.env.VITE_W3SPAY_REGISTRY_ADDRESS;
  const recorded = isValidRegistryAddress(existing) ? existing : undefined;
  let deployRegistry = flags.freshRegistry || !recorded;
  if (recorded && !flags.freshRegistry && !flags.yes) {
    if (!(await ui.confirm(`Reuse existing registry ${recorded}?`, true))) deployRegistry = true;
  }

  // Secrets.
  let deployerSeed: string | undefined;
  let publishMnemonic: string | undefined;
  let prompted = false;

  if (deployRegistry) {
    deployerSeed = process.env.DEPLOYER_SEED?.trim() || undefined;
    if (!deployerSeed) {
      if (flags.dryRun) ui.warn("DEPLOYER_SEED not set — would block a real run.");
      else if (flags.yes) {
        throw new BlockedError(
          "DEPLOYER_SEED is not set in .env.local (required to deploy the registry in --yes mode).",
        );
      } else {
        deployerSeed = await ui.password("Deployer seed (12/24-word mnemonic)");
        prompted = true;
      }
    }
    if (deployerSeed) validateMnemonic(deployerSeed, "DEPLOYER_SEED", true);
  }

  if (!flags.skipApp) {
    const dotns = (process.env.DOTNS_MNEMONIC ?? "").trim().replace(/\s+/g, " ");
    const mnem = (process.env.MNEMONIC ?? "").trim().replace(/\s+/g, " ");
    if (dotns && mnem && dotns !== mnem) {
      throw new BlockedError(
        "DOTNS_MNEMONIC and MNEMONIC are both set but differ. Unset the stale one in .env.local.",
      );
    }
    publishMnemonic = dotns || mnem || undefined;
    if (!publishMnemonic) {
      if (flags.dryRun) ui.warn("MNEMONIC not set — would block a real run.");
      else if (flags.yes) {
        throw new BlockedError(
          "MNEMONIC (or DOTNS_MNEMONIC) is not set in .env.local (required to publish in --yes mode).",
        );
      } else {
        publishMnemonic = await ui.password("Publisher mnemonic (MNEMONIC)");
        prompted = true;
      }
    }
    if (publishMnemonic) validateMnemonic(publishMnemonic, "Publisher mnemonic", false);
  }

  const publishDefault = flags.publish ?? parsePublishFlag(process.env.BULLETIN_DEPLOY_PUBLISH);
  let publishToBrowse = flags.skipApp ? false : publishDefault;
  if (!flags.skipApp && flags.publish === undefined && !flags.yes && !flags.dryRun) {
    publishToBrowse = await ui.confirm(
      "Publish to the Browse directory? (lists the .dot in the on-chain Publisher registry; paseo-next-v2 only)",
      publishDefault,
    );
  }

  let persistSecrets = false;
  if (prompted && !flags.dryRun) {
    persistSecrets = await ui.confirm("Save secrets to .env.local (gitignored)?", true);
  }
  const cfg: Config = {
    networkKey,
    network,
    domain,
    registryAddress: deployRegistry ? undefined : recorded,
    deployRegistry,
    deployerSeed,
    publishMnemonic,
    publishToBrowse,
    persistSecrets,
  };

  reviewConfig(cfg, flags);
  if (!flags.yes && !flags.dryRun) {
    if (!(await ui.confirm("Save choices to .env.local and continue?", true))) {
      throw new BlockedError("Aborted at review.");
    }
  }

  // Persist choices (and prompted secrets) — never in dry-run.
  if (!flags.dryRun) {
    const values: Record<string, string> = {
      VITE_NETWORK: networkKey,
      BULLETIN_DEPLOY_PUBLISH: publishToBrowse ? "true" : "false",
    };
    if (domain) values.VITE_DOTNS_PRODUCT_DOMAIN = domain;
    if (persistSecrets) {
      if (deployerSeed) values.DEPLOYER_SEED = deployerSeed;
      if (publishMnemonic) values.MNEMONIC = publishMnemonic;
    }
    upsertEnvFile(ENV_LOCAL, values, {
      headerComment: "# Local-only env for w3spay-admin. Gitignored — never commit secrets.",
    });
  }

  return cfg;
}

function validateMnemonic(seed: string, label: string, derive: boolean): void {
  const words = mnemonicWordCount(seed);
  if (words !== 12 && words !== 24) {
    throw new BlockedError(`${label} has ${words} words; expected 12 or 24.`);
  }
  if (derive) {
    try {
      accountFromSeed(seed);
    } catch {
      throw new BlockedError(`${label} is not a valid sr25519 mnemonic.`);
    }
  }
}

function reviewConfig(cfg: Config, flags: SetupFlags): void {
  ui.blank();
  ui.log(ui.c.bold("Review"));
  ui.bullet(`Network:   ${cfg.network.displayName} (${cfg.networkKey})`);
  ui.bullet(`Domain:    ${cfg.domain || ui.c.dim(flags.skipApp ? "(skipped — --skip-app)" : "(not set)")}`);
  if (!cfg.deployRegistry) ui.bullet(`Registry:  reuse ${cfg.registryAddress}`);
  else if (cfg.deployerSeed) {
    const acct = accountFromSeed(cfg.deployerSeed);
    ui.bullet(`Registry:  deploy fresh (owner ${short(acct.ss58)} / ${short(acct.h160)})`);
  } else ui.bullet(`Registry:  deploy fresh ${ui.c.dim("(deployer seed not provided)")}`);
  ui.bullet(`Publish:   ${flags.skipApp ? ui.c.dim("skipped (--skip-app)") : cfg.publishToBrowse ? "yes — list in Browse directory" : "no (upload only)"}`);
}

async function phaseReadiness(cfg: Config, flags: SetupFlags): Promise<void> {
  ui.heading("Readiness");
  const client = createClient(getWsProvider(cfg.network.mainChain.wsUrl));
  const blockers: string[] = [];
  try {
    const api = client.getUnsafeApi();
    try {
      await withTimeout(api.query.System.Number.getValue(), RPC_TIMEOUT_MS, "RPC probe");
      ui.success(`Asset Hub RPC reachable (${cfg.network.mainChain.wsUrl})`);
    } catch {
      ui.error(`Asset Hub RPC unreachable (${cfg.network.mainChain.wsUrl})`);
      blockers.push(`Check connectivity to ${cfg.network.mainChain.wsUrl}`);
    }

    if (cfg.deployRegistry && cfg.deployerSeed) {
      const acct = accountFromSeed(cfg.deployerSeed);
      try {
        const info = (await withTimeout(
          api.query.System.Account.getValue(acct.ss58),
          RPC_TIMEOUT_MS,
          "balance",
        )) as { data?: { free?: bigint } };
        const free = info?.data?.free ?? 0n;
        if (free === 0n) {
          ui.error(`Deployer ${short(acct.ss58)} has 0 PAS`);
          blockers.push(`Fund ${acct.ss58} on ${cfg.network.displayName} → ${FAUCET_HINT}`);
        } else if (free < ONE_PAS) {
          ui.warn(`Deployer ${short(acct.ss58)} has ${formatPas(free)} PAS (< 1) → ${FAUCET_HINT}`);
        } else {
          ui.success(`Deployer ${short(acct.ss58)} (${short(acct.h160)}) — ${formatPas(free)} PAS`);
        }
      } catch {
        ui.error(`Could not read deployer balance for ${short(acct.ss58)}`);
        blockers.push(`Asset Hub account query failed for ${acct.ss58}`);
      }
    }
  } finally {
    client.destroy();
  }

  if (blockers.length) {
    throw new BlockedError(`Readiness checks failed:\n${blockers.map((b) => `   - ${b}`).join("\n")}`);
  }
  if (!flags.yes && !flags.dryRun) {
    if (!(await ui.confirm("Continue?", true))) throw new BlockedError("Aborted at readiness.");
  }
}

function phaseRegistry(cfg: Config): `0x${string}` {
  ui.heading("Registry");
  if (!cfg.deployRegistry) {
    ui.success(`registry ${cfg.registryAddress} (reused)`);
    return cfg.registryAddress as `0x${string}`;
  }

  if (!existsSync(resolve(REPO_ROOT, "contracts", "node_modules"))) {
    ui.log("Installing contracts dependencies…");
    const install = spawnSync("npm", ["install", "--prefix", "contracts"], {
      stdio: "inherit",
      cwd: REPO_ROOT,
      env: process.env,
    });
    if (install.status !== 0) throw new BlockedError("npm install in contracts failed — see output above.");
  }

  ui.log("Deploying W3SPayRegistry…");
  const deploy = spawnSync("npm", ["run", "deploy", "--prefix", "contracts"], {
    stdio: "inherit",
    cwd: REPO_ROOT,
    env: { ...process.env, NETWORK: cfg.networkKey, DEPLOYER_SEED: cfg.deployerSeed },
  });
  if (deploy.status !== 0) throw new BlockedError("Registry deployment failed — see output above.");

  const addr = readEnvKey(ENV_LOCAL, "VITE_W3SPAY_REGISTRY_ADDRESS");
  if (!isValidRegistryAddress(addr)) {
    throw new BlockedError(
      "Registry deployed but VITE_W3SPAY_REGISTRY_ADDRESS was not written to .env.local.",
    );
  }
  ui.success(`registry ${addr} (deployed)`);
  return addr;
}

async function phaseAdmins(cfg: Config, registryAddress: `0x${string}`, flags: SetupFlags): Promise<void> {
  ui.heading("Admins");
  const adminGrantCmd = "W3SPAY_REGISTRY_ADDRESS=0x… W3SPAY_ADMIN=0x… npm run registry:add-admin --prefix contracts";
  const superAdminGrantCmd =
    "W3SPAY_REGISTRY_ADDRESS=0x… W3SPAY_SUPER_ADMIN=0x… npm run registry:add-super-admin --prefix contracts";
  if (flags.yes) {
    ui.log(ui.c.dim(`skipped — grant admins later with: ${adminGrantCmd}`));
    ui.log(ui.c.dim(`skipped — grant super admins later with: ${superAdminGrantCmd}`));
    return;
  }
  const grantSuperAdmins = await ui.confirm(
    "Grant the registry super admin role to additional addresses now?",
    false,
  );

  const grantAdmins = await ui.confirm("Grant the registry admin role to additional addresses now?", false);

  if (!grantAdmins && !grantSuperAdmins) return;

  // Granting is super-admin-only; the deployer seed is the first super admin.
  let ownerSeed = cfg.deployerSeed ?? process.env.DEPLOYER_SEED?.trim() ?? undefined;
  if (!ownerSeed) {
    const entered = await ui.password("Deployer seed (super admin — required to grant; blank to skip)");
    ownerSeed = entered.trim() || undefined;
    if (!ownerSeed) {
      ui.warn("No deployer seed — skipping role grants.");
      return;
    }
  }

  const grantSeed = ownerSeed;

  ui.log(ui.c.dim(`Registry: ${registryAddress}`));

  const grantRole = async (
    prompt: string,
    script: string,
    roleEnvKey: "W3SPAY_ADMIN" | "W3SPAY_SUPER_ADMIN",
    success: (address: string) => string,
    failure: (address: string) => string,
  ): Promise<void> => {
    for (;;) {
      const addr = (await ui.text(prompt)).trim();
      if (!addr) break;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        ui.warn("Not a valid H160 (0x + 40 hex). Try again.");
        continue;
      }
      const res = spawnSync("npm", ["run", script, "--prefix", "contracts"], {
        stdio: "inherit",
        cwd: REPO_ROOT,
        env: withRegistryGrantEnv(
          process.env,
          registryAddress,
          cfg.networkKey,
          grantSeed,
          roleEnvKey,
          addr,
        ),
      });
      if (res.status !== 0) ui.warn(`${failure(addr)} — see output above. Continuing.`);
      else ui.success(success(addr));
    }
  };
  if (grantSuperAdmins) {
    await grantRole(
      "Super admin H160 (blank to finish)",
      "registry:add-super-admin",
      "W3SPAY_SUPER_ADMIN",
      (addr) => `promoted ${addr} to super admin`,
      (addr) => `Promoting ${addr} to super admin failed`,
    );
  }

  if (grantAdmins) {
    await grantRole(
      "Admin H160 (blank to finish)",
      "registry:add-admin",
      "W3SPAY_ADMIN",
      (addr) => `granted admin ${addr}`,
      (addr) => `Granting admin ${addr} failed`,
    );
  }
}

function phaseApp(cfg: Config, registryAddress: `0x${string}`, flags: SetupFlags): void {
  ui.heading("Build & publish");
  if (flags.skipApp) {
    ui.log(ui.c.dim("skipped — --skip-app"));
    return;
  }
  const env: NodeJS.ProcessEnv = withRegistryEnv(
    {
      ...process.env,
      BULLETIN_ENV: cfg.networkKey,
      VITE_NETWORK: cfg.networkKey,
    },
    registryAddress,
  );
  if (cfg.publishMnemonic) env.MNEMONIC = cfg.publishMnemonic;
  env.BULLETIN_DEPLOY_PUBLISH = cfg.publishToBrowse ? "true" : "false";
  const res = spawnSync("bash", ["deploy.sh", cfg.domain], { stdio: "inherit", cwd: REPO_ROOT, env });
  if (res.status !== 0) throw new BlockedError("App publish failed — see output above.");
}

function summary(cfg: Config, registryAddress: `0x${string}` | undefined, flags: SetupFlags): void {
  ui.heading(`✓ Deploy complete — ${cfg.networkKey}`);
  if (registryAddress) ui.bullet(`Registry: ${registryAddress}`);
  if (!flags.skipApp && cfg.domain) {
    const name = cfg.domain.replace(/\.dot$/, "");
    const gateway = process.env.DOTNS_GATEWAY_BASE || "dot.li";
    ui.bullet(`App:      https://${name}.${gateway}`);
    if (cfg.publishToBrowse) ui.bullet("Listed in the Browse directory (Publisher registry).");
  }
  ui.blank();
  ui.log(ui.c.dim("Next steps:"));
  ui.log(ui.c.dim("  • Open the app inside a Polkadot host to use the admin console."));
  ui.log(ui.c.dim("  • Grant more admins: W3SPAY_REGISTRY_ADDRESS=0x… W3SPAY_ADMIN=0x… npm run registry:add-admin --prefix contracts"));
  ui.log(ui.c.dim("  • Grant more super admins: W3SPAY_REGISTRY_ADDRESS=0x… W3SPAY_SUPER_ADMIN=0x… npm run registry:add-super-admin --prefix contracts"));
  ui.log(ui.c.dim("  • Re-run `npm run setup` to redeploy — the recorded registry is reused."));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  ui.blank();
  ui.log(ui.c.bold("w3spay-admin deploy"));
  ui.log(ui.c.dim(flags.dryRun ? "Dry run — checks only, no changes." : "Guided one-command deploy."));

  phaseEnvironment(flags);
  const cfg = await phaseConfigure(flags);
  await phaseReadiness(cfg, flags);

  if (flags.dryRun) {
    ui.blank();
    ui.success("Dry-run complete — environment, config, and readiness checked. No changes made.");
    return;
  }

  const registryAddress = phaseRegistry(cfg);
  await phaseAdmins(cfg, registryAddress, flags);
  phaseApp(cfg, registryAddress, flags);
  summary(cfg, registryAddress, flags);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === realpathSync(self);
  } catch {
    return entry === self;
  }
}

if (isMainModule()) {
  main()
    .then(() => ui.closeUi())
    .catch((err: unknown) => {
      ui.closeUi();
      ui.blank();
      if (err instanceof BlockedError) ui.error(err.message);
      else ui.error(`Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      process.exit(1);
    });
}
