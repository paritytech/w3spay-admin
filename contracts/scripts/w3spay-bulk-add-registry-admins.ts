// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import {
  createScriptContext,
  loadDefaultEnv,
  normalizeH160,
  readRegistry,
  requireRegistryAddress,
  writeRegistry,
} from "./lib/revive";

// ---------------------------------------------------------------------------
// Edit this list. Each entry is an H160 (0x… 20 bytes) address that should be
// granted the admin role on the W3SPayRegistry. Only the registry owner can
// run this — non-owner signers will be rejected before any tx is submitted.
//
// The script is idempotent: addresses that are already admins are skipped,
// and the run continues past per-tx failures (collecting them at the end)
// instead of aborting halfway through.
// ---------------------------------------------------------------------------
const ADMINS: readonly string[] = [
  "0xc5f738ddd832b5466e53d235e65a9e156ef01cfd",
  "0xa62627b81549a7c087abb612579b32b36be244f5",
  "0x5940940e7c1d9301a5ead19adfb810949da3a56e",
  "0xcc3ad2c99618251bb5424bafc9375c00d045ad1c",
  "0x02a74c843634de634444861bf553b55d04126d67",
  "0x245f06559f32ce3d9a50e7756636210ad78111d3",
  "0x39c2e7d38ff234f184c3ae596524a85ba312ec99",
  "0x861566ce073106916a2b7bb52d7e4193698e94a5",
  "0x750d00da231eb2b1512735c8adbe12d56787dba1",
  "0x88258b2a02677624d69b5a57820146cbc0492ab1"
];

interface Outcome {
  readonly address: `0x${string}`;
  readonly status: "added" | "already-admin" | "failed";
  readonly txHash?: string;
  readonly reason?: string;
}

async function main(): Promise<void> {
  loadDefaultEnv();

  if (ADMINS.length === 0) {
    console.error(
      "ADMINS is empty — edit contracts/scripts/w3spay-bulk-add-registry-admins.ts and add at least one H160.",
    );
    process.exit(1);
  }

  // Normalize + de-duplicate (case-insensitively) up front so we don't waste a
  // read or a tx on the same address twice.
  const seen = new Set<string>();
  const targets: `0x${string}`[] = [];
  for (let i = 0; i < ADMINS.length; i += 1) {
    const raw = ADMINS[i]!;
    const normalized = normalizeH160(raw, `ADMINS[${i}]`);
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(normalized);
  }

  const registryAddress = requireRegistryAddress();
  const ctx = await createScriptContext({ signer: true });
  if (!ctx.signer) throw new Error("missing signer context");

  const outcomes: Outcome[] = [];
  try {
    console.log(`Registry:  ${registryAddress}`);
    console.log(`Owner H160: ${ctx.signer.h160}`);
    console.log(`Candidates: ${targets.length}`);

    const owner = await readRegistry<`0x${string}`>(ctx, registryAddress, "owner");
    if (owner.toLowerCase() !== ctx.signer.h160.toLowerCase()) {
      throw new Error(
        `signer ${ctx.signer.h160} is not the registry owner (${owner}). Only the owner can grant admin roles.`,
      );
    }

    for (const admin of targets) {
      try {
        const alreadyAdmin = await readRegistry<boolean>(ctx, registryAddress, "isAdmin", [admin]);
        if (alreadyAdmin) {
          console.log(`[skip] ${admin} is already an admin.`);
          outcomes.push({ address: admin, status: "already-admin" });
          continue;
        }

        console.log(`[send] addAdmin(${admin})`);
        const txHash = await writeRegistry(ctx, registryAddress, "addAdmin", [admin]);
        console.log(`[ok]   tx confirmed: ${txHash}`);
        outcomes.push({ address: admin, status: "added", txHash });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[fail] ${admin}: ${reason}`);
        outcomes.push({ address: admin, status: "failed", reason });
      }
    }
  } finally {
    ctx.client.destroy();
  }

  const added = outcomes.filter((o) => o.status === "added").length;
  const skipped = outcomes.filter((o) => o.status === "already-admin").length;
  const failed = outcomes.filter((o) => o.status === "failed");
  console.log("");
  console.log(`Summary: ${added} added, ${skipped} already admin, ${failed.length} failed.`);
  if (failed.length > 0) {
    for (const f of failed) console.error(`  - ${f.address}: ${f.reason}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
