/**
 * Minimal argv + env parser used by W3SPay admin scripts.
 *
 * Registry scripts normally run via `tsx`, so they can accept regular CLI
 * flags. Each script declares its inputs as `--<flag>` keys; we resolve them
 * in this order:
 *   1. `--flag=value` or `--flag value` in `process.argv`.
 *   2. Environment variable `W3SPAY_<FLAG>` with dashes uppercased to
 *      underscores.
 *
 * Example:
 *   --merchant-id   ↔  W3SPAY_MERCHANT_ID
 *   --admin         ↔  W3SPAY_ADMIN
 *   --display-name  ↔  W3SPAY_DISPLAY_NAME
 */

export type Argv = Record<string, string>;

const ENV_PREFIX = "W3SPAY_";

function envKeyFor(flag: string): string {
  return ENV_PREFIX + flag.replace(/-/g, "_").toUpperCase();
}

export function parseArgv(): Argv {
  const out: Argv = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq >= 0) {
      out[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = raw[i + 1];
    if (next != null && !next.startsWith("--")) {
      out[token.slice(2)] = next;
      i += 1;
    } else {
      // Bare flag — treat as true.
      out[token.slice(2)] = "true";
    }
  }
  return out;
}

/**
 * Look up a script argument, preferring an explicit CLI flag and falling back
 * to the `W3SPAY_<FLAG>` env var. Returns `undefined` when neither is set.
 */
export function readArg(argv: Argv, key: string): string | undefined {
  const fromCli = argv[key];
  if (fromCli != null && fromCli.length > 0) return fromCli;
  const fromEnv = process.env[envKeyFor(key)];
  if (fromEnv != null && fromEnv.length > 0) return fromEnv;
  return undefined;
}

export function requireArg(argv: Argv, key: string, usageHint?: string): string {
  const value = readArg(argv, key);
  if (value == null) {
    const envName = envKeyFor(key);
    throw new Error(
      `missing required --${key}${usageHint ? ` (${usageHint})` : ""}; ` +
        `pass --${key}=… or set ${envName}=…`
    );
  }
  return value;
}
