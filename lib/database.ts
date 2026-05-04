import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseConfig } from "./env";

export function getDatabase() {
  if (process.env.E2E_DISABLE_DATABASE === "1") {
    return null;
  }

  const { url } = getDatabaseConfig();

  if (!url) {
    return null;
  }

  return drizzle(neon(url));
}
