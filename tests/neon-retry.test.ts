import { describe, expect, it, vi } from "vitest";
import { isRetryableNeonError, withNeonRetry } from "@/lib/neon-retry";

describe("neon-retry", () => {
  it("detects control plane failures in the error message", () => {
    expect(
      isRetryableNeonError(
        new Error('Server error (HTTP status 500): {"message":"Control plane request failed"}'),
      ),
    ).toBe(true);
  });

  it("detects nested cause with neon:retryable", () => {
    const inner = new Error('{"message":"x","neon:retryable":true}');
    const outer = new Error("Failed query");
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(isRetryableNeonError(outer)).toBe(true);
  });

  it("does not retry ordinary errors", () => {
    expect(isRetryableNeonError(new Error("syntax error"))).toBe(false);
  });

  it("withNeonRetry succeeds after transient failures", async () => {
    let calls = 0;
    const run = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error(
          'Server error (HTTP status 500): {"message":"Control plane request failed","neon:retryable":true}',
        );
      }
      return 42;
    });

    await expect(withNeonRetry(run, { baseDelayMs: 1 })).resolves.toBe(42);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
