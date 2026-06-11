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
  const target = normalizeH160(requireArg(argv, "super-admin", "0x EVM/H160 address"), "super-admin");
  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  try {
    console.log(`Registry:  ${registryAddress}`);
    console.log(`Signer H160: ${ctx.signer.h160}`);
    console.log(`New super admin: ${target}`);

    const senderIsSuper = await readRegistry<boolean>(ctx, registryAddress, "isSuperAdmin", [
      ctx.signer.h160,
    ]);
    if (!senderIsSuper) {
      throw new Error(
        `signer ${ctx.signer.h160} is not a registry super admin. Only super admins can grant roles.`,
      );
    }

    const alreadySuper = await readRegistry<boolean>(ctx, registryAddress, "isSuperAdmin", [target]);
    if (alreadySuper) {
      console.log(`${target} is already a super admin — nothing to do.`);
      return;
    }

    const txHash = await writeRegistry(ctx, registryAddress, "addSuperAdmin", [target]);
    console.log(`tx confirmed: ${txHash}`);
    const isSuperAdmin = await readRegistry<boolean>(ctx, registryAddress, "isSuperAdmin", [target]);
    const isAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [target]);
    console.log(`isSuperAdmin(${target}) = ${isSuperAdmin}`);
    console.log(`isAdmin(${target}) = ${isAdmin}`);
  } finally {
    ctx.client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
