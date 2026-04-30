import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ analyses: await listAnalyses() });
}
