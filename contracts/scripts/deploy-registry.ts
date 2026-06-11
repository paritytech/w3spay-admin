/**
 * Does not use Hardhat Ignition or the EVM JSON-RPC path: targets the same PAPI
 * network registry as the admin app, so deployments land on the chain selected
 * by NETWORK/--env (default: paseo-next-v2).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, Binary } from "polkadot-api";
import { getWsProvider } from "@polkadot-api/ws-provider";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { AccountId } from "@polkadot-api/substrate-bindings";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import { encodeAbiParameters, keccak256, type Abi, type AbiParameter } from "viem";

import {
  resolveNetwork,
  SUPPORTED_NETWORKS,
} from "../../src/shared/chain/host/networks";
import { parseEnvSelector } from "./lib/argv";
import { upsertEnvFile } from "../../scripts/lib/env-files";
import { loadDefaultEnv } from "./lib/revive";

const CONTRACTS_ROOT = resolve(__dirname, "..");
const APP_ROOT = resolve(CONTRACTS_ROOT, "..");
// Sibling consumer app — w3spay reads `VITE_W3SPAY_REGISTRY_ADDRESS`
// out of its own `.env.local`. Keeping the two in sync used to be a
// manual two-step (deploy, then copy the address by hand into
// `apps/w3spay/.env.local`); the deploy now writes both files so a
// fresh deploy can't end up with the admin pointing at the new
// contract while the consumer still talks to the old one.
const W3SPAY_APP_ROOT = resolve(APP_ROOT, "..", "w3spay");
const ARTIFACT_PATH = resolve(
  CONTRACTS_ROOT,
  "artifacts/src/W3SPayRegistry.sol/W3SPayRegistry.json",
);
const GAS_MULTIPLIER = 4n;
const REGISTRY_ARTIFACT_NAME = "W3SPayRegistry";

interface Artifact {
  abi: Abi;
  bytecode: `0x${string}`;
}

interface SignerBundle {
  signer: PolkadotSigner;
  publicKey: Uint8Array;
  ss58: string;
  h160: `0x${string}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local at the repo root or export it.`);
  return value;
}

function createSigner(): SignerBundle {
  const seed = requireEnv("DEPLOYER_SEED");
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(seed));
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive("");
  const publicKey = keyPair.publicKey;
  const h160 = deriveH160(publicKey);

  return {
    signer: getPolkadotSigner(publicKey, "Sr25519", keyPair.sign),
    publicKey,
    ss58: AccountId(42).dec(publicKey),
    h160,
  };
}

/** pallet-revive maps AccountId32 -> H160 as keccak256(AccountId32)[12..32]. */
function deriveH160(publicKey: Uint8Array): `0x${string}` {
  const hash = keccak256(publicKey);
  return `0x${hash.slice(26)}` as `0x${string}`;
}

function loadArtifact(): Artifact {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `Missing Hardhat artifact at ${ARTIFACT_PATH}. Run npm run compile before deploying.`,
    );
  }
  const raw = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  if (typeof raw.bytecode !== "string" || raw.bytecode === "0x") {
    throw new Error("W3SPayRegistry artifact has empty bytecode.");
  }
  return { abi: raw.abi as Abi, bytecode: raw.bytecode as `0x${string}` };
}

function encodeConstructorArgs(abi: Abi): `0x${string}` {
  const constructor = (abi as readonly any[]).find((entry) => entry.type === "constructor") as
    | { inputs?: AbiParameter[] }
    | undefined;
  if (!constructor?.inputs?.length) return "0x";
  return encodeAbiParameters(constructor.inputs, []);
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

function extractHex(value: unknown): `0x${string}` | undefined {
  if (typeof value === "string" && value.startsWith("0x")) return value as `0x${string}`;
  if (value && typeof (value as { asHex?: unknown }).asHex === "function") {
    return (value as { asHex(): `0x${string}` }).asHex();
  }
  if (value instanceof Uint8Array) return `0x${Buffer.from(value).toString("hex")}` as `0x${string}`;
  return undefined;
}

async function ensureMapped(api: any, signer: PolkadotSigner, ss58: string): Promise<void> {
  const mapped = await api.apis.ReviveApi.address(ss58);
  if (mapped) {
    console.log(`Account already mapped: ${extractHex(mapped) ?? String(mapped)}`);
    return;
  }

  console.log("Mapping deployer account for pallet-revive...");
  const result = await api.tx.Revive.map_account().signAndSubmit(signer);
  if (!result.ok) throw new Error(`Revive.map_account failed: ${stringify(result.dispatchError)}`);
  console.log(`Account mapped (tx: ${result.txHash}).`);
}

async function deployRegistry(api: any, signer: PolkadotSigner, origin: string, dryRunDeposit: bigint) {
  const { abi, bytecode } = loadArtifact();
  const constructorArgs = encodeConstructorArgs(abi);
  const codeWithArgs = constructorArgs === "0x"
    ? bytecode
    : (`${bytecode}${constructorArgs.slice(2)}` as `0x${string}`);

  console.log(`Deploying ${REGISTRY_ARTIFACT_NAME} via Revive.instantiate_with_code...`);

  const dryRun = await api.apis.ReviveApi.instantiate(
    origin,
    0n,
    undefined,
    dryRunDeposit,
    { type: "Upload", value: Binary.fromHex(codeWithArgs) },
    Binary.fromHex("0x"),
    undefined,
  );

  if (!dryRun.result.success) {
    throw new Error(`${REGISTRY_ARTIFACT_NAME} dry-run failed: ${stringify(dryRun.result.value)}`);
  }
  if (dryRun.result.value.result?.flags & 1) {
    throw new Error(`${REGISTRY_ARTIFACT_NAME} constructor reverted during dry-run.`);
  }

  const weightLimit = {
    ref_time: dryRun.weight_required.ref_time * GAS_MULTIPLIER,
    proof_size: dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const storageDepositLimit =
    dryRun.storage_deposit.type === "Charge" && dryRun.storage_deposit.value > 0n
      ? dryRun.storage_deposit.value * GAS_MULTIPLIER
      : dryRunDeposit;

  console.log(`Gas: ref_time=${weightLimit.ref_time}, proof_size=${weightLimit.proof_size}`);
  console.log(`Storage deposit limit: ${storageDepositLimit}`);

  const tx = api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    code: Binary.fromHex(codeWithArgs),
    data: Binary.fromHex("0x"),
    salt: undefined,
  });

  const result = await tx.signAndSubmit(signer);
  if (!result.ok) {
    throw new Error(`${REGISTRY_ARTIFACT_NAME} deployment failed: ${stringify(result.dispatchError)}`);
  }

  let contractAddress: `0x${string}` | undefined;
  for (const event of result.events) {
    if (event.type !== "Revive") continue;
    const value = event.value as any;
    if (value?.type !== "Instantiated") continue;
    contractAddress = extractHex(value.value?.contract);
    if (contractAddress) break;
  }

  if (!contractAddress) {
    contractAddress = extractHex(dryRun.result.value.account_id);
  }
  if (!contractAddress) {
    throw new Error("Could not determine deployed registry address from events or dry-run.");
  }

  return { contractAddress, txHash: result.txHash as string };
}

function writeDeployment(networkKey: string, address: `0x${string}`, txHash: string): void {
  const deploymentDir = resolve(CONTRACTS_ROOT, "deployments", networkKey);
  mkdirSync(deploymentDir, { recursive: true });
  writeFileSync(
    resolve(deploymentDir, "deployed_addresses.json"),
    `${JSON.stringify({ [`W3SPayRegistry#${REGISTRY_ARTIFACT_NAME}`]: address }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(deploymentDir, "deployment.json"),
    `${JSON.stringify({ network: networkKey, registryAddress: address, txHash, deployedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  loadDefaultEnv();
  const cliEnv = parseEnvSelector(process.argv, SUPPORTED_NETWORKS);
  if (cliEnv) process.env.NETWORK = cliEnv;

  const network = resolveNetwork(process.env.NETWORK, {
    mainGenesisHash: process.env.VITE_CHAIN_GENESIS_HASH,
    bulletinGenesisHash: process.env.VITE_BULLETIN_GENESIS_HASH,
  });
  if (!network.mainChain.genesisHash) {
    throw new Error(`Network ${network.key} is missing mainChain.genesisHash.`);
  }

  const dryRunDeposit = 50n * 10n ** BigInt(network.nativeToken.decimals);
  const { signer, ss58, h160 } = createSigner();

  console.log("W3SPay Registry Deployment — pallet-revive");
  console.log(`Network:       ${network.displayName} (${network.key})`);
  console.log(`WS URL:        ${network.mainChain.wsUrl}`);
  console.log(`Genesis:       ${network.mainChain.genesisHash}`);
  console.log(`Deployer SS58: ${ss58}`);
  console.log(`Deployer H160: ${h160}`);

  const client = createClient(getWsProvider(network.mainChain.wsUrl));
  try {
    const api = client.getUnsafeApi();
    await ensureMapped(api, signer, ss58);
    const { contractAddress, txHash } = await deployRegistry(api, signer, ss58, dryRunDeposit);

    writeDeployment(network.key, contractAddress, txHash);

    const envValues = {
      VITE_NETWORK: network.key,
      VITE_W3SPAY_REGISTRY_ADDRESS: contractAddress,
    };
    const adminEnvPath = resolve(APP_ROOT, ".env.local");
    const w3spayEnvPath = resolve(W3SPAY_APP_ROOT, ".env.local");
    upsertEnvFile(adminEnvPath, envValues);

    // The consumer app may not always be checked out next to the admin
    // (someone working out of a stripped tree, or a CI job that only
    // pulled the admin). Don't fail the deploy — just warn so they
    // know they need to sync the address by hand.
    let w3spayUpdated = false;
    if (existsSync(W3SPAY_APP_ROOT)) {
      upsertEnvFile(w3spayEnvPath, envValues, {
        headerComment:
          "# Local-only env for `vite dev` / `vite build`. Gitignored.\n" +
          "#\n" +
          "# Written by `apps/w3spay-admin/contracts/scripts/deploy-registry.ts`\n" +
          "# whenever the W3SPayRegistry is redeployed. Keep this in sync\n" +
          "# with `apps/w3spay-admin/.env.local` — both apps must talk to the\n" +
          "# same on-chain registry.",
      });
      w3spayUpdated = true;
    }

    console.log("\nDeployment complete.");
    console.log(`Registry: ${contractAddress}`);
    console.log(`Tx:       ${txHash}`);
    console.log(`Owner/admin H160: ${h160}`);
    console.log(`Wrote:    ${resolve(CONTRACTS_ROOT, "deployments", network.key, "deployed_addresses.json")}`);
    console.log(`Updated:  ${adminEnvPath}`);
    if (w3spayUpdated) {
      console.log(`Updated:  ${w3spayEnvPath}`);
    } else {
      console.warn(
        `Skipped:  ${w3spayEnvPath} — the w3spay app is not present at this checkout.\n` +
        `          Set VITE_W3SPAY_REGISTRY_ADDRESS=${contractAddress} and\n` +
        `          VITE_NETWORK=${network.key} by hand wherever w3spay runs.`,
      );
    }
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error("\nDeployment failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
