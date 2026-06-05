/**
 * Race a promise against a wall-clock timeout. Used wherever a hung host
 * RPC, signer, or runtime call would otherwise leave the UI spinning
 * forever.
 *
 * The timer is always cleaned up — `finally` runs on both resolution and
 * rejection. `label` is woven into the timeout error so callers can tell
 * which request stalled without a stack trace.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const { promise: timeout, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
