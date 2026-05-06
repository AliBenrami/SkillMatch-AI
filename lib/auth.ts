import { cookies } from "next/headers";
import crypto from "node:crypto";
import type { SessionUser } from "./auth-model";
import { canAccess as canAccessByArea, type AccessArea } from "./auth-permissions";
import { getAuthConfig } from "./env";
import { sessionUserSchema, signedSessionPayloadSchema } from "./validation";

const cookieName = "skillmatch_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;

type SignedSessionPayload = SessionUser & {
  iat: number;
  exp: number;
};

function secret() {
  return getAuthConfig(process.env, { requireUsers: false }).secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function signaturesMatch(payload: string, signature: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const expected = Buffer.from(sign(payload), "hex");
  const actual = Buffer.from(signature, "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function createSessionToken(user: SessionUser) {
  const safeUser = sessionUserSchema.parse(user);
  const issuedAt = nowInSeconds();
  const signedPayload: SignedSessionPayload = {
    ...safeUser,
    iat: issuedAt,
    exp: issuedAt + sessionMaxAgeSeconds
  };
  const payload = Buffer.from(JSON.stringify(signedPayload), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token?: string): SessionUser | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  if (!payload || !signature || !signaturesMatch(payload, signature)) {
    return null;
  }

  try {
    const session = signedSessionPayloadSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown
    );
    if (!session.success || session.data.exp <= nowInSeconds()) {
      return null;
    }

    return {
      name: session.data.name,
      email: session.data.email,
      role: session.data.role
    };
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
    maxAge: sessionMaxAgeSeconds
  });
}

export async function clearSessionUser() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export function canAccess(user: SessionUser | null, area: AccessArea) {
  return canAccessByArea(user, area);
}
