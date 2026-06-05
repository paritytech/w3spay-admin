/**
 * Update destinationAccountId and/or displayName for an existing W3SPay terminal via pallet-revive.
 */

import { parseArgv, readArg, requireArg } from "./lib/argv";
import { formatStatus, parseDestinationAccountId } from "./lib/destination";
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
  const destinationAccountId = parseDestinationAccountId(requireArg(argv, "destination"));
  const displayName = readArg(argv, "display-name") ?? "";

  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:             ${registryAddress}`);
    console.log(`Admin H160:           ${ctx.signer.h160}`);
    console.log(`Merchant:             ${merchantId} / ${terminalId}`);
    console.log(`DestinationAccountId: ${destinationAccountId}`);
    console.log(`DisplayName:          ${displayName || "(empty)"}`);

    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [ctx.signer.h160]);
    if (!isAdmin) throw new Error(`signer ${ctx.signer.h160} is not a registry admin`);

    const existing = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchant", [merchantId, terminalId]);
    if (!existing.exists) {
      throw new Error(`no merchant registered for (${merchantId}, ${terminalId}). Use w3spay-register-merchant.`);
    }
    console.log(
      `Existing: destinationAccountId=${existing.destinationAccountId} status=${formatStatus(existing.status)} display="${existing.displayName}"`,
    );

    const txHash = await writeRegistry(ctx, registryAddress, "updateMerchant", [
      merchantId,
      terminalId,
      destinationAccountId,
      displayName,
    ]);
    console.log(`tx confirmed: ${txHash}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
