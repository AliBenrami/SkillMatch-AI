import { NextResponse } from "next/server";
import type { ApiErrorPayload } from "./api-error-payload";

const MIGRATE_PG_CODES = new Set(["42P01", "42703"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractPgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (isRecord(current)) {
      const code = current["code"];
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
        return code;
      }
    }
    current = isRecord(current) ? current["cause"] : undefined;
  }
  return undefined;
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error && current.message) {
      messages.push(current.message);
    } else if (typeof current === "string") {
      messages.push(current);
    }
    current = isRecord(current) ? current["cause"] : undefined;
  }
  return messages;
}

export function classifyServerError(error: unknown): ApiErrorPayload {
  const code = extractPgErrorCode(error);
  if (code && MIGRATE_PG_CODES.has(code)) {
    return {
      error: "Database schema is missing or outdated.",
      code,
      hint: "migrate"
    };
  }

  const text = collectErrorMessages(error).join(" ").toLowerCase();
  if (
    text.includes("does not exist") &&
    (text.includes("relation") || text.includes("column") || text.includes("undefined column"))
  ) {
    return {
      error: "Database schema is missing or outdated.",
      hint: "migrate"
    };
  }

  return {
    error: "Something went wrong while loading data.",
    hint: "contact_admin"
  };
}

export function serverErrorResponse(error: unknown): NextResponse {
  const body = classifyServerError(error);
  return NextResponse.json(body, { status: 500 });
}
