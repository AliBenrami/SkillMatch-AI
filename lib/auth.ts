import { cookies } from "next/headers";
import crypto from "node:crypto";
import type { SessionUser } from "./auth-model";

const cookieName = "skillmatch_session";

function secret() {
  return process.env.AUTH_SECRET ?? "skillmatch-ai-local-demo-secret";
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createSessionToken(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token?: string): SessionUser | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(cookieName)?.value);
}

export async function setSessionUser(user: SessionUser) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearSessionUser() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export function canAccess(user: SessionUser | null, area: "admin" | "recruiter" | "learning") {
  if (!user) {
    return false;
  }

  if (area === "admin") {
    return user.role === "system_admin";
  }

  if (area === "learning") {
    return user.role === "learning_development" || user.role === "system_admin";
  }

  return ["recruiter", "hiring_manager", "system_admin"].includes(user.role);
}
