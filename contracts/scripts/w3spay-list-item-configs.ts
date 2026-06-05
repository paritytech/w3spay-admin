/**
 * Dump every published item-config CID record from the W3SPay registry.
 */

import {
  createScriptContext,
  loadDefaultEnv,
  readRegistry,
  requireRegistryAddress,
} from "./lib/revive";

interface RawItemConfigRecord {
  configId: string;
  cid: string;
  size: number | bigint;
  updatedAt: number | bigint;
  exists: boolean;
}

async function main(): Promise<void> {
  loadDefaultEnv();
  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: false });

  try {
    console.log(`Registry: ${registryAddress}`);

    const version = await readRegistry<bigint>(ctx, registryAddress, "getVersion");
    const count = await readRegistry<bigint>(ctx, registryAddress, "getItemConfigCount");
    console.log(`version:  ${version}`);
    console.log(`count:    ${count}`);

    const ids = await readRegistry<string[]>(ctx, registryAddress, "getAllItemConfigIds");
    if (ids.length === 0) {
      console.log("(no item-config records)");
      return;
    }

    console.log("");
    for (const configId of ids) {
      const record = await readRegistry<RawItemConfigRecord>(
        ctx,
        registryAddress,
        "getItemConfig",
        [configId],
      );
      console.log(`[${configId}]`);
      console.log(`  cid:        ${record.cid}`);
      console.log(`  size:       ${record.size}`);
      console.log(
        `  updatedAt:  ${new Date(Number(record.updatedAt) * 1000).toISOString()}`,
      );
      console.log("");
    }
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
