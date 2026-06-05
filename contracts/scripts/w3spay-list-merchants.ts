/**
 * Dump every registered row from the W3SPay registry via pallet-revive dry-runs.
 */

import { formatStatus } from "./lib/destination";
import {
  createScriptContext,
  loadDefaultEnv,
  type MerchantEntry,
  readRegistry,
  requireRegistryAddress,
} from "./lib/revive";

async function main(): Promise<void> {
  loadDefaultEnv();
  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: false });

  try {
    console.log(`Registry: ${registryAddress}`);

    const version = await readRegistry<bigint>(ctx, registryAddress, "getVersion");
    const count = await readRegistry<bigint>(ctx, registryAddress, "getMerchantCount");
    console.log(`version:  ${version}`);
    console.log(`count:    ${count}`);

    const keys = await readRegistry<`0x${string}`[]>(ctx, registryAddress, "getAllTerminalKeys");
    if (keys.length === 0) {
      console.log("(empty registry)");
      return;
    }

    console.log("");
    for (const key of keys) {
      const entry = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchantByKey", [key]);
      console.log(`[${entry.merchantId} / ${entry.terminalId}]`);
      console.log(`  key:                  ${key}`);
      console.log(`  destinationAccountId: ${entry.destinationAccountId}`);
      console.log(`  status:               ${formatStatus(entry.status)}`);
      console.log(`  displayName:          ${entry.displayName || "(empty)"}`);
      console.log(`  addedAt:              ${new Date(Number(entry.addedAt) * 1000).toISOString()}`);
      console.log(`  updatedAt:            ${new Date(Number(entry.updatedAt) * 1000).toISOString()}`);
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
