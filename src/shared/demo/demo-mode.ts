/**
 * Demo-mode entry point for the admin console.
 *
 * Re-exports `isDemoMode()` from `host-connection.ts` so callers in
 * `providers/`, `hooks/`, and `lib/contract/` import from a single,
 * unambiguous module. The flag itself is owned by `host-connection.ts`
 * because it composes with `isInHost()` and lives next to the host
 * detection it depends on.
 *
 * The rest of this directory holds the synthetic fixtures (accounts,
 * merchants, balances) and pure helpers (action reducers) that demo
 * mode wires into the existing providers.
 */
export { isDemoMode } from "@shared/api/host-connection.ts";
