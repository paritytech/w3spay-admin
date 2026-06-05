/**
 * Grant a new admin role on the W3SPay registry. Must be run by the owner.
 *
 * Inputs can be passed as CLI flags or W3SPAY_* env vars:
 *   W3SPAY_ADMIN=0xNewAdminH160 npx tsx scripts/w3spay-add-registry-admin.ts
 */

import { parseArgv, requireArg } from "./lib/argv";
import {
  createScriptContext,
  loadDefaultEnv,
  normalizeH160,
  readRegistry,
  requireRegistryAddress,
  writeRegistry,
} from "./lib/revive";

async function main(): Promise<void> {
  loadDefaultEnv();
  const argv = parseArgv();
  const newAdmin = normalizeH160(requireArg(argv, "admin", "0x EVM/H160 address"), "admin");
  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:  ${registryAddress}`);
    console.log(`Owner H160: ${ctx.signer.h160}`);
    console.log(`New admin: ${newAdmin}`);

    const owner = await readRegistry<`0x${string}`>(ctx, registryAddress, "owner");
    if (owner.toLowerCase() !== ctx.signer.h160.toLowerCase()) {
      throw new Error(
        `signer ${ctx.signer.h160} is not the registry owner (${owner}). Only the owner can grant admin roles.`,
      );
    }

    const alreadyAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [newAdmin]);
    if (alreadyAdmin) {
      console.log(`${newAdmin} is already an admin — nothing to do.`);
      return;
    }

    const txHash = await writeRegistry(ctx, registryAddress, "addAdmin", [newAdmin]);
    console.log(`tx confirmed: ${txHash}`);
    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [newAdmin]);
    console.log(`isAdmin(${newAdmin}) = ${isAdmin}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
