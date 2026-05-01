import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDatabase } from "./database";

export type UserRole =
  | "employee"
  | "recruiter"
  | "hiring_manager"
  | "learning_development"
  | "system_admin";

export type SessionUser = {
  name: string;
  email: string;
  role: UserRole;
};

export type CredentialUser = SessionUser & {
  password?: string;
  passwordHash?: string;
};

const fallbackCredentialUsers: CredentialUser[] = [
  {
    name: "Priya Recruiter",
    email: "recruiter@skillmatch.demo",
    role: "recruiter",
    password: "SkillMatchDemo!23"
  },
  {
    name: "Yash Admin",
    email: "admin@skillmatch.demo",
    role: "system_admin",
    password: "SkillMatchAdmin!23"
  },
  {
    name: "Lina L&D",
    email: "learning@skillmatch.demo",
    role: "learning_development",
    password: "SkillMatchLearn!23"
  }
];

export function createPasswordHash(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const key = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

function isUserRole(value: string): value is UserRole {
  return ["employee", "recruiter", "hiring_manager", "learning_development", "system_admin"].includes(value);
}

function verifyPasswordHash(password: string, passwordHash: string) {
  const [algorithm, salt, storedKey] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !storedKey) {
    return false;
  }

  const actual = Buffer.from(crypto.scryptSync(password, salt, 64).toString("base64url"));
  const expected = Buffer.from(storedKey);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function getCredentialUsers() {
  const configuredUsers = process.env.AUTH_USERS_JSON;
  if (!configuredUsers) {
    return fallbackCredentialUsers;
  }

  try {
    const parsed = JSON.parse(configuredUsers) as CredentialUser[];
    return parsed.filter((user) => user.email && user.name && user.role && (user.password || user.passwordHash));
  } catch {
    return [];
  }
}

export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDatabase();
  const [databaseUser] = db
    ? await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    : [];

  if (databaseUser) {
    if (!password || !verifyPasswordHash(password, databaseUser.passwordHash)) {
      return null;
    }

    return {
      name: databaseUser.name,
      email: databaseUser.email,
      role: isUserRole(databaseUser.role) ? databaseUser.role : "employee"
    };
  }

  const user = getCredentialUsers().find((item) => item.email.toLowerCase() === normalizedEmail);
  if (!user || !password) {
    return null;
  }

  const suppliedPassword = Buffer.from(password);
  const expectedPassword = Buffer.from(user.password ?? "");
  const verified = user.passwordHash
    ? verifyPasswordHash(password, user.passwordHash)
    : suppliedPassword.length === expectedPassword.length &&
      crypto.timingSafeEqual(suppliedPassword, expectedPassword);

  if (!verified) {
    return null;
  }

  return {
    name: user.name,
    email: user.email,
    role: user.role
  };
}

export async function createCredentialUser(input: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<SessionUser> {
  const db = getDatabase();
  if (!db) {
    throw new Error("Signup requires DATABASE_URL to be configured.");
  }

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const role = input.role && isUserRole(input.role) ? input.role : "employee";

  if (name.length < 2) {
    throw new Error("Enter your name.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (input.password.length < 10) {
    throw new Error("Use a password with at least 10 characters.");
  }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    throw new Error("An account already exists for that email.");
  }

  const user: SessionUser = {
    name,
    email,
    role
  };

  await db.insert(users).values({
    id: crypto.randomUUID(),
    ...user,
    passwordHash: createPasswordHash(input.password)
  });

  return user;
}
