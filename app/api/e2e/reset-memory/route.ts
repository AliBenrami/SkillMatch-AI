import { NextResponse } from "next/server";
import { resetMemoryStoresForE2e } from "@/lib/db";

/** Clears memory-backed SkillMatch stores between Playwright tests. Disabled in production. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!resetMemoryStoresForE2e()) {
    return NextResponse.json({ error: "Reset only applies without DATABASE_URL." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
