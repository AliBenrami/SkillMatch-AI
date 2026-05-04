import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const envFiles = [".env.local", ".env"];
const migrationsFolder = "./db/migrations";

function stripWrappingQuotes(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function readEnvFileValue(filePath, key) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  const contents = readFileSync(filePath, "utf8");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contents.match(new RegExp(`^${escapedKey}\\s*=\\s*(.*)$`, "m"));
  const rawValue = match?.[1]?.trim();

  return rawValue ? stripWrappingQuotes(rawValue) : undefined;
}

export function readDatabaseUrl(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const explicitValue = env.DATABASE_URL?.trim();

  if (explicitValue) {
    return explicitValue;
  }

  for (const fileName of envFiles) {
    const value = readEnvFileValue(path.join(cwd, fileName), "DATABASE_URL");
    if (value) {
      return value;
    }
  }

  return undefined;
}

export async function runMigrations(options = {}) {
  const databaseUrl = readDatabaseUrl(options);

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run database setup. Checked process.env, .env.local, and .env.");
  }

  await migrate(drizzle(neon(databaseUrl)), { migrationsFolder });

  return {
    databaseUrl,
    migrationsFolder
  };
}

async function main() {
  const result = await runMigrations();
  console.log(`Database setup complete via ${result.migrationsFolder}.`);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
