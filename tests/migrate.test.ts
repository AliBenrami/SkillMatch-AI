import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirectories: string[] = [];

async function loadReadDatabaseUrl() {
  const module = await import("../scripts/migrate.mjs");
  return module.readDatabaseUrl as (options?: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
  }) => string | undefined;
}

function createTempDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "skillmatch-migrate-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("readDatabaseUrl", () => {
  it("prefers DATABASE_URL from the process environment", async () => {
    const readDatabaseUrl = await loadReadDatabaseUrl();
    const cwd = createTempDir();

    fs.writeFileSync(path.join(cwd, ".env.local"), "DATABASE_URL=postgres://from-local-file");
    expect(readDatabaseUrl({ cwd, env: { DATABASE_URL: "postgres://from-env" } })).toBe("postgres://from-env");
  });

  it("falls back to .env.local before .env", async () => {
    const readDatabaseUrl = await loadReadDatabaseUrl();
    const cwd = createTempDir();

    fs.writeFileSync(path.join(cwd, ".env"), "DATABASE_URL=postgres://from-env-file");
    fs.writeFileSync(path.join(cwd, ".env.local"), 'DATABASE_URL="postgres://from-local-file"');

    expect(readDatabaseUrl({ cwd, env: {} })).toBe("postgres://from-local-file");
  });

  it("returns undefined when no database URL is configured", async () => {
    const readDatabaseUrl = await loadReadDatabaseUrl();

    expect(readDatabaseUrl({ cwd: createTempDir(), env: {} })).toBeUndefined();
  });
});
