import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  try {
    const env = readFileSync(".env", "utf8");
    const match = env.match(/^DATABASE_URL=(.*)$/m);
    return match?.[1]?.trim().replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

const databaseUrl = readDatabaseUrl();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

await migrate(drizzle(neon(databaseUrl)), { migrationsFolder: "./db/migrations" });
console.log("Database migrations applied.");
