function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True when Neon marks the failure as safe to retry (or matches known transient control-plane errors). */
export function isRetryableNeonError(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    if (seen.has(current)) break;
    seen.add(current);

    const obj = current as Record<string, unknown>;
    const message = String(obj.message ?? "");

    if (message.includes("Control plane request failed")) return true;
    if (message.includes('"neon:retryable":true') || message.includes('"neon:retryable": true'))
      return true;

    const next = obj.cause ?? obj.sourceError;
    current = next;
  }

  return false;
}

/** Runs `run` with exponential backoff when Neon returns a retryable control-plane / HTTP error. */
export async function withNeonRetry<T>(
  run: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 300;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isRetryableNeonError(err) || attempt === attempts - 1) {
        throw err;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError;
}
