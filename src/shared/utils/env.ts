/**
 * Low-level helpers for reading `import.meta.env` values with fallbacks.
 * Each function coerces a raw env string to the target primitive type.
 *
 * These are implementation details of `config.ts`. Import from there;
 * never call these from feature code.
 */

export function envString(key: string, fallback: string): string {
  const value = import.meta.env[key] as string | undefined;
  return value ?? fallback;
}

export function envBigInt(key: string, fallback: string): bigint {
  return BigInt((import.meta.env[key] as string | undefined) ?? fallback);
}

export function envNumber(key: string, fallback: string): number {
  return Number((import.meta.env[key] as string | undefined) ?? fallback);
}

/** Treats `"true"`, `"1"`, and `"yes"` (case-insensitive) as `true`. */
export function envFlag(key: string, fallback: boolean): boolean {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}
