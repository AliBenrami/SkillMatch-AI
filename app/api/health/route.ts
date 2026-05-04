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

/** Tables expected to exist; columns checked only when the table is already present. */
const requiredColumns = [{ table: "candidate_recommendations", column: "ai_insight" }] as const;

export const dynamic = "force-dynamic";

function createMemoryHealthResponse() {
  return NextResponse.json({
    status: "ok",
    database: {
      configured: false,
      mode: "memory",
      schemaReady: false,
      missingTables: requiredTables.filter((table) => table !== "__drizzle_migrations"),
      missingColumns: [] as string[]
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
    const tableRows = await sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `;

    const publicTables = new Set(tableRows.map((row) => String(row.table_name)));
    const missingTables = requiredTables.filter((table) => !publicTables.has(table));

    const columnRows = await sql`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
    `;
    const columnKeys = new Set(
      columnRows.map((row) => `${String(row.table_name)}.${String(row.column_name)}`)
    );
    const missingColumns: string[] = [];
    for (const { table, column } of requiredColumns) {
      if (publicTables.has(table) && !columnKeys.has(`${table}.${column}`)) {
        missingColumns.push(`${table}.${column}`);
      }
    }

    const schemaReady = missingTables.length === 0 && missingColumns.length === 0;

    return NextResponse.json(
      {
        status: schemaReady ? "ok" : "degraded",
        database: {
          configured: true,
          mode: "postgres",
          schemaReady,
          missingTables,
          missingColumns
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
          missingTables: [...requiredTables],
          missingColumns: [] as string[]
        },
        error: error instanceof Error ? error.message : "Database health check failed."
      },
      { status: 503 }
    );
  }
}
