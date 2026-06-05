/**
 * Hard-delete a W3SPay terminal entry from the registry via pallet-revive.
 * Prefer W3SPAY_STATUS=revoked for normal lifecycle removal.
 */

import { parseArgv, requireArg } from "./lib/argv";
import { formatStatus } from "./lib/destination";
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

  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:  ${registryAddress}`);
    console.log(`Admin H160: ${ctx.signer.h160}`);
    console.log(`Removing:  ${merchantId} / ${terminalId}`);

    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [ctx.signer.h160]);
    if (!isAdmin) throw new Error(`signer ${ctx.signer.h160} is not a registry admin`);

    const existing = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchant", [merchantId, terminalId]);
    if (!existing.exists) throw new Error(`no merchant registered for (${merchantId}, ${terminalId})`);
    console.log(`DestinationAccountId: ${existing.destinationAccountId}`);
    console.log(`Status:               ${formatStatus(existing.status)}`);
    console.log(`DisplayName:          ${existing.displayName || "(empty)"}`);

    const txHash = await writeRegistry(ctx, registryAddress, "removeMerchant", [merchantId, terminalId]);
    console.log(`tx confirmed: ${txHash}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
