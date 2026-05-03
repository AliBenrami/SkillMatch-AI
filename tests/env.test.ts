import { describe, expect, it } from "vitest";
import { getAuthConfig, getDatabaseConfig, getStorageConfig, validateRuntimeEnvironment } from "@/lib/env";

function createEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides
  };
}

describe("runtime environment validation", () => {
  it("allows local demo fallbacks outside production", () => {
    expect(getAuthConfig(createEnv())).toMatchObject({
      usesLocalDemoSecret: true,
      usesFallbackUsers: true
    });
    expect(getDatabaseConfig(createEnv())).toMatchObject({
      url: null,
      usesMemoryFallback: true
    });
    expect(getStorageConfig(createEnv())).toEqual({ provider: "local" });
  });

  it("rejects invalid AUTH_USERS_JSON", () => {
    expect(() => getAuthConfig(createEnv({ AUTH_USERS_JSON: "{\"bad\":true}" }))).toThrow(
      /AUTH_USERS_JSON must be a non-empty JSON array/
    );
  });

  it("rejects incomplete R2 configuration even in local development", () => {
    expect(() => getStorageConfig(createEnv({ R2_ACCOUNT_ID: "acct", R2_BUCKET: "bucket" }))).toThrow(
      /R2 storage configuration is incomplete/
    );
  });

  it("requires production envs to opt out of local fallbacks", () => {
    expect(() => validateRuntimeEnvironment(createEnv({ NODE_ENV: "production" }))).toThrow(
      /AUTH_USERS_JSON must be configured in production/
    );
    expect(() => getDatabaseConfig(createEnv({ NODE_ENV: "production" }))).toThrow(
      /DATABASE_URL must be configured in production/
    );
    expect(() => getStorageConfig(createEnv({ NODE_ENV: "production" }))).toThrow(
      /R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be configured in production/
    );
  });

  it("accepts a fully configured production environment", () => {
    const env = createEnv({
      NODE_ENV: "production",
      AUTH_SECRET: "a-production-secret-with-enough-entropy-12345",
      AUTH_USERS_JSON:
        '[{"name":"Admin","email":"admin@example.com","role":"system_admin","passwordHash":"scrypt$salt$hash"}]',
      DATABASE_URL: "postgresql://user:password@example.neon.tech/neondb?sslmode=require",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "resumes",
      R2_PUBLIC_BASE_URL: "https://cdn.example.com/resumes"
    });

    expect(validateRuntimeEnvironment(env)).toMatchObject({
      auth: {
        secret: "a-production-secret-with-enough-entropy-12345",
        usesLocalDemoSecret: false,
        usesFallbackUsers: false
      },
      database: {
        url: "postgresql://user:password@example.neon.tech/neondb?sslmode=require",
        usesMemoryFallback: false
      },
      storage: {
        provider: "r2",
        bucket: "resumes",
        publicBaseUrl: "https://cdn.example.com/resumes"
      }
    });
  });
});
