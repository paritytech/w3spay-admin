/**
 * Register a new merchant terminal in the W3SPay registry via pallet-revive.
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
  const merchantId = requireArg(argv, "merchant-id", "stable short handle");
  const terminalId = requireArg(argv, "terminal-id", "physical register/till");
  const destinationAccountId = parseDestinationAccountId(
    requireArg(argv, "destination", "AccountId32 payout destination or H160 to left-pad"),
  );
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
    if (!isAdmin) {
      throw new Error(
        `signer ${ctx.signer.h160} is not a registry admin. Run w3spay-add-registry-admin.ts from the owner first.`,
      );
    }

    const existing = await readRegistry<MerchantEntry>(ctx, registryAddress, "getMerchant", [merchantId, terminalId]);
    if (existing.exists) {
      throw new Error(
        `merchant already exists: (${merchantId}, ${terminalId}) status=${formatStatus(existing.status)}`,
      );
    }

    const txHash = await writeRegistry(ctx, registryAddress, "registerMerchant", [
      merchantId,
      terminalId,
      destinationAccountId,
      displayName,
    ]);
    console.log(`tx confirmed:     ${txHash}`);

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
