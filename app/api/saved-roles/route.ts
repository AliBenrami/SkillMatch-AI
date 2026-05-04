import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteSavedTargetRole, listSavedTargetRoles, saveTargetRole } from "@/lib/db";
import { roles } from "@/lib/seed-data";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    return NextResponse.json({ savedRoles: await listSavedTargetRoles(user.email) });
  } catch (error) {
    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    roleId?: string;
    targetScore?: number;
    currentScore?: number | null;
    matchedSkills?: string[];
    missingSkills?: string[];
  };
  const role = roles.find((item) => item.id === payload.roleId);
  if (!role) {
    return NextResponse.json({ error: "Choose a valid target role." }, { status: 400 });
  }

  const savedRole = await saveTargetRole({
    employeeEmail: user.email,
    roleId: role.id,
    roleTitle: role.title,
    targetScore: payload.targetScore,
    currentScore: payload.currentScore,
    matchedSkills: payload.matchedSkills,
    missingSkills: payload.missingSkills
  });

  return NextResponse.json({ savedRole });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Saved role id is required." }, { status: 400 });
  }

  await deleteSavedTargetRole({ employeeEmail: user.email, id });
  return NextResponse.json({ ok: true });
}
