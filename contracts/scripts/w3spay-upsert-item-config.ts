/**
 * Upsert an item-config CID record on the W3SPay registry via pallet-revive.
 *
 * Inputs (CLI flag OR W3SPAY_* env var):
 *   --config-id    / W3SPAY_CONFIG_ID
 *   --config-cid   / W3SPAY_CONFIG_CID
 *   --config-size  / W3SPAY_CONFIG_SIZE
 */

import { parseArgv, requireArg } from "./lib/argv";
import {
  createScriptContext,
  loadDefaultEnv,
  readRegistry,
  requireRegistryAddress,
  writeRegistry,
} from "./lib/revive";

interface RawItemConfigRecord {
  configId: string;
  cid: string;
  size: number | bigint;
  updatedAt: number | bigint;
  exists: boolean;
}

function parseNonNegativeBigInt(raw: string, label: string): bigint {
  const value = raw.trim();
  if (!/^[0-9]+$/.test(value)) throw new Error(`${label} must be a non-negative integer; got ${raw}`);
  return BigInt(value);
}

async function main(): Promise<void> {
  loadDefaultEnv();
  const argv = parseArgv();

  const configId = requireArg(argv, "config-id", "logical id of the item config");
  const cid = requireArg(argv, "config-cid", "Bulletin CID v1 (raw blake2b-256)");
  const size = parseNonNegativeBigInt(
    requireArg(argv, "config-size", "envelope size in bytes (uint32)"),
    "config-size",
  );

  if (size === 0n) throw new Error("config-size must be > 0");
  if (size > 0xff_ff_ff_ffn) throw new Error("config-size exceeds uint32 range");

  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:    ${registryAddress}`);
    console.log(`Admin H160:  ${ctx.signer.h160}`);
    console.log(`Config:      ${configId}`);
    console.log(`CID:         ${cid}`);
    console.log(`Size:        ${size}`);

    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [ctx.signer.h160]);
    if (!isAdmin) {
      throw new Error(
        `signer ${ctx.signer.h160} is not a registry admin. Run w3spay-add-registry-admin.ts from the owner first.`,
      );
    }

    const txHash = await writeRegistry(ctx, registryAddress, "upsertItemConfig", [
      configId,
      cid,
      Number(size),
    ]);
    console.log(`tx confirmed:     ${txHash}`);

    const record = await readRegistry<RawItemConfigRecord>(ctx, registryAddress, "getItemConfig", [configId]);
    console.log(
      `registry.${configId}: cid=${record.cid} size=${record.size} ` +
        `updatedAt=${record.updatedAt}`,
    );
    const version = await readRegistry<bigint>(ctx, registryAddress, "getVersion");
    console.log(`registry.version: ${version}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
