import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getDatabaseConfig } from "@/lib/env";

const requiredTables = [
  "users",
  "analyses",
  "audit_events",
  "candidate_recommendations",
  "saved_target_roles",
  "__drizzle_migrations"
] as const;

export const dynamic = "force-dynamic";

function createMemoryHealthResponse() {
  return NextResponse.json({
    status: "ok",
    database: {
      configured: false,
      mode: "memory",
      schemaReady: false,
      missingTables: requiredTables.filter((table) => table !== "__drizzle_migrations")
    }
  });
}

export async function GET() {
  const { url } = getDatabaseConfig();

  if (!url) {
    return createMemoryHealthResponse();
  }

  try {
    const sql = neon(url);
    const rows = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `;

    const existingTables = new Set(
      rows
        .map((row) => String(row.table_name))
        .filter((tableName) => requiredTables.includes(tableName as (typeof requiredTables)[number]))
    );
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    const schemaReady = missingTables.length === 0;

    return NextResponse.json(
      {
        status: schemaReady ? "ok" : "degraded",
        database: {
          configured: true,
          mode: "postgres",
          schemaReady,
          missingTables
        }
      },
      { status: schemaReady ? 200 : 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: {
          configured: true,
          mode: "postgres",
          schemaReady: false,
          missingTables: requiredTables
        },
        error: error instanceof Error ? error.message : "Database health check failed."
      },
      { status: 503 }
    );
  }
}
