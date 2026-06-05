/**
 * Change lifecycle status for an existing W3SPay terminal via pallet-revive.
 */

import { parseArgv, requireArg } from "./lib/argv";
import { formatStatus, parseMerchantStatus } from "./lib/destination";
import {
  createScriptContext,
  loadDefaultEnv,
  type MerchantEntry,
  readRegistry,
  requireRegistryAddress,
  writeRegistry,
} from "./lib/revive";

async function main(): Promise<void> {
  loadDefaultEnv();
  const argv = parseArgv();
  const merchantId = requireArg(argv, "merchant-id");
  const terminalId = requireArg(argv, "terminal-id");
  const status = parseMerchantStatus(requireArg(argv, "status", "active | paused | revoked"));

  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:  ${registryAddress}`);
    console.log(`Admin H160: ${ctx.signer.h160}`);
    console.log(`Merchant:  ${merchantId} / ${terminalId}`);
    console.log(`NewStatus: ${formatStatus(status)}`);

    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [ctx.signer.h160]);
    if (!isAdmin) throw new Error(`signer ${ctx.signer.h160} is not a registry admin`);

    const existing = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchant", [merchantId, terminalId]);
    if (!existing.exists) throw new Error(`no merchant registered for (${merchantId}, ${terminalId})`);
    console.log(`CurrentStatus: ${formatStatus(existing.status)}`);

    const txHash = await writeRegistry(ctx, registryAddress, "setMerchantStatus", [merchantId, terminalId, status]);
    console.log(`tx confirmed: ${txHash}`);

    const updated = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchant", [merchantId, terminalId]);
    console.log(`UpdatedStatus: ${formatStatus(updated.status)}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
