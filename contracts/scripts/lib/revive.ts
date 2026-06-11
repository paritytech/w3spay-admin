import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, Binary, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "@polkadot-api/ws-provider";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { AccountId } from "@polkadot-api/substrate-bindings";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers";
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  type Abi,
} from "viem";

import {
  resolveNetwork,
  SUPPORTED_NETWORKS,
  type NetworkConfig,
} from "../../../src/shared/chain/host/networks";
import { parseEnvSelector } from "./argv";
import { loadEnvFile } from "../../../scripts/lib/env-files";

export const CONTRACTS_ROOT = resolve(__dirname, "..", "..");
export const APP_ROOT = resolve(CONTRACTS_ROOT, "..");
export const REGISTRY_ARTIFACT_PATH = resolve(
  CONTRACTS_ROOT,
  "artifacts/src/W3SPayRegistry.sol/W3SPayRegistry.json",
);

export const READ_ONLY_ORIGIN = "5C4hrfjw9DjXZTzV3MwzrrAr9P1MLDHajjSidz9bR544LEq1";
const GAS_MULTIPLIER = 4n;

export interface RegistryArtifact {
  abi: Abi;
  bytecode: `0x${string}`;
}

export interface SignerBundle {
  signer: PolkadotSigner;
  publicKey: Uint8Array;
  ss58: string;
  h160: `0x${string}`;
}

export interface ScriptContext {
  network: NetworkConfig;
  client: PolkadotClient;
  api: any;
  artifact: RegistryArtifact;
  signer?: SignerBundle;
  dryRunDeposit: bigint;
}

export interface MerchantEntry {
  merchantId: string;
  terminalId: string;
  destinationAccountId: `0x${string}`;
  displayName: string;
  status: bigint | number;
  addedAt: bigint | number;
  updatedAt: bigint | number;
  exists: boolean;
}

export function loadDefaultEnv(): void {
  // Single source of truth: the repo-root .env.local (where deploy-registry
  // writes VITE_NETWORK + the registry address) then .env. Already-set
  // process.env keys win, so exported shell vars still override the files.
  loadEnvFile(resolve(APP_ROOT, ".env.local"));
  loadEnvFile(resolve(APP_ROOT, ".env"));
}

export function parseEnvFlag(argv: string[]): string | undefined {
  return parseEnvSelector(argv, SUPPORTED_NETWORKS);
}

export function resolveScriptNetwork(argv = process.argv): NetworkConfig {
  loadDefaultEnv();
  const cliEnv = parseEnvFlag(argv);
  if (cliEnv) process.env.NETWORK = cliEnv;

  const selected = process.env.NETWORK || process.env.VITE_NETWORK;
  const network = resolveNetwork(selected, {
    mainGenesisHash: process.env.VITE_CHAIN_GENESIS_HASH,
    bulletinGenesisHash: process.env.VITE_BULLETIN_GENESIS_HASH,
  });
  if (!network.mainChain.genesisHash) {
    throw new Error(`Network ${network.key} is missing mainChain.genesisHash.`);
  }
  return network;
}

export function loadRegistryArtifact(): RegistryArtifact {
  if (!existsSync(REGISTRY_ARTIFACT_PATH)) {
    throw new Error(
      `Missing Hardhat artifact at ${REGISTRY_ARTIFACT_PATH}. Run npm run compile first.`,
    );
  }
  const raw = JSON.parse(readFileSync(REGISTRY_ARTIFACT_PATH, "utf8"));
  if (typeof raw.bytecode !== "string" || raw.bytecode === "0x") {
    throw new Error("W3SPayRegistry artifact has empty bytecode.");
  }
  return { abi: raw.abi as Abi, bytecode: raw.bytecode as `0x${string}` };
}

export function normalizeH160(raw: string, label = "address"): `0x${string}` {
  const trimmed = raw.trim();
  if (!isAddress(trimmed)) throw new Error(`${label} must be a 0x EVM/H160 address; got ${raw}`);
  return getAddress(trimmed).toLowerCase() as `0x${string}`;
}

export function requireRegistryAddress(): `0x${string}` {
  const value = process.env.W3SPAY_REGISTRY_ADDRESS || process.env.VITE_W3SPAY_REGISTRY_ADDRESS;
  if (!value) {
    throw new Error(
      "Set W3SPAY_REGISTRY_ADDRESS or VITE_W3SPAY_REGISTRY_ADDRESS to the deployed registry address.",
    );
  }
  return normalizeH160(value, "registry address");
}

export function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return String(value);
  }
}

export function createSigner(): SignerBundle {
  const seed = process.env.DEPLOYER_SEED;
  if (!seed) throw new Error("DEPLOYER_SEED is not set. Add it to .env.local at the repo root or export it.");

  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(seed));
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive("");
  const publicKey = keyPair.publicKey;
  return {
    signer: getPolkadotSigner(publicKey, "Sr25519", keyPair.sign),
    publicKey,
    ss58: AccountId(42).dec(publicKey),
    h160: deriveH160(publicKey),
  };
}

export function deriveH160(publicKey: Uint8Array): `0x${string}` {
  const hash = keccak256(publicKey);
  return `0x${hash.slice(26)}` as `0x${string}`;
}

export function connect(network: NetworkConfig): { client: PolkadotClient; api: any } {
  const client = createClient(getWsProvider(network.mainChain.wsUrl));
  return { client, api: client.getUnsafeApi() };
}

export async function createScriptContext(options: { signer: boolean }): Promise<ScriptContext> {
  const network = resolveScriptNetwork();
  const artifact = loadRegistryArtifact();
  const { client, api } = connect(network);
  const dryRunDeposit = 50n * 10n ** BigInt(network.nativeToken.decimals);
  const signer = options.signer ? createSigner() : undefined;

  console.log(`Network:  ${network.displayName} (${network.key})`);
  console.log(`WS URL:   ${network.mainChain.wsUrl}`);
  console.log(`Genesis:  ${network.mainChain.genesisHash}`);
  if (signer) {
    console.log(`Signer SS58: ${signer.ss58}`);
    console.log(`Signer H160: ${signer.h160}`);
  }

  if (signer) await ensureMapped(api, signer.signer, signer.ss58);
  return { network, client, api, artifact, signer, dryRunDeposit };
}

export async function ensureMapped(api: any, signer: PolkadotSigner, ss58: string): Promise<void> {
  const mapped = await api.apis.ReviveApi.address(ss58);
  if (mapped) {
    console.log(`Account already mapped: ${extractHex(mapped) ?? String(mapped)}`);
    return;
  }

  console.log("Mapping signer account for pallet-revive...");
  const result = await api.tx.Revive.map_account().signAndSubmit(signer);
  if (!result.ok) throw new Error(`Revive.map_account failed: ${stringify(result.dispatchError)}`);
  console.log(`Account mapped (tx: ${result.txHash}).`);
}

export async function readRegistry<T = unknown>(
  ctx: ScriptContext,
  registryAddress: `0x${string}`,
  functionName: string,
  args: unknown[] = [],
  origin = READ_ONLY_ORIGIN,
): Promise<T> {
  const calldata = encodeFunctionData({ abi: ctx.artifact.abi, functionName, args });
  const dryRun = await ctx.api.apis.ReviveApi.call(
    origin,
    registryAddress.toLowerCase(),
    0n,
    undefined,
    undefined,
    Binary.fromHex(calldata),
    { at: "best" },
  );

  if (!dryRun.result.success) {
    throw new Error(`${functionName} read failed: ${stringify(dryRun.result.value)}`);
  }
  if (dryRun.result.value.flags & 1) {
    throw new Error(`${functionName} read reverted`);
  }

  const hex = Binary.toHex(dryRun.result.value.data);
  if (hex === "0x") throw new Error(`${functionName} returned empty data at ${registryAddress}`);
  return decodeFunctionResult({
    abi: ctx.artifact.abi,
    functionName,
    data: hex as `0x${string}`,
  }) as T;
}

export async function writeRegistry(
  ctx: ScriptContext,
  registryAddress: `0x${string}`,
  functionName: string,
  args: unknown[] = [],
): Promise<string> {
  if (!ctx.signer) throw new Error("writeRegistry requires a signer context");

  const calldata = encodeFunctionData({ abi: ctx.artifact.abi, functionName, args });
  const dryRun = await ctx.api.apis.ReviveApi.call(
    ctx.signer.ss58,
    registryAddress.toLowerCase(),
    0n,
    undefined,
    ctx.dryRunDeposit,
    Binary.fromHex(calldata),
  );

  if (!dryRun.result.success) {
    throw new Error(`${functionName} dry-run failed: ${stringify(dryRun.result.value)}`);
  }
  if (dryRun.result.value.flags & 1) {
    throw new Error(`${functionName} dry-run reverted`);
  }

  const weightLimit = {
    ref_time: dryRun.weight_required.ref_time * GAS_MULTIPLIER,
    proof_size: dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const storageDepositLimit =
    dryRun.storage_deposit.type === "Charge" && dryRun.storage_deposit.value > 0n
      ? dryRun.storage_deposit.value * GAS_MULTIPLIER
      : ctx.dryRunDeposit;

  const tx = ctx.api.tx.Revive.call({
    dest: registryAddress.toLowerCase(),
    value: 0n,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    data: Binary.fromHex(calldata),
  });
  const result = await tx.signAndSubmit(ctx.signer.signer);
  if (!result.ok) throw new Error(`${functionName} failed: ${stringify(result.dispatchError)}`);
  return result.txHash as string;
}

export function extractHex(value: unknown): `0x${string}` | undefined {
  if (typeof value === "string" && value.startsWith("0x")) return value as `0x${string}`;
  if (value && typeof (value as { asHex?: unknown }).asHex === "function") {
    return (value as { asHex(): `0x${string}` }).asHex();
  }
  if (value instanceof Uint8Array) return `0x${Buffer.from(value).toString("hex")}` as `0x${string}`;
  return undefined;
}
