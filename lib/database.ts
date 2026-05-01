import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return drizzle(neon(process.env.DATABASE_URL));
}
