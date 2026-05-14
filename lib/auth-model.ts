import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { getDatabase } from "./database";
import { getAuthConfig } from "./env";
import { sessionUserSchema, signupRequestSchema, userRoleSchema, type UserRole } from "./validation";

export type SessionUser = {
  name: string;
  email: string;
  role: UserRole;
};

export type CredentialUser = SessionUser & {
  password?: string;
  passwordHash?: string;
};

type LoginThrottleEntry = {
  attempts: number;
  windowStartedAt: number;
  lockedUntil: number | null;
};

export type LoginThrottleResult = {
  throttled: boolean;
  scope: "email" | "ip" | null;
  retryAfterSeconds: number;
};

type LoginThrottleConfig = {
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
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

const defaultLoginThrottleConfig: LoginThrottleConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000
};

const emailLoginThrottle = new Map<string, LoginThrottleEntry>();
const ipLoginThrottle = new Map<string, LoginThrottleEntry>();

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLoginThrottleConfig(): LoginThrottleConfig {
  return {
    maxAttempts: readPositiveIntegerEnv("AUTH_LOGIN_MAX_ATTEMPTS", defaultLoginThrottleConfig.maxAttempts),
    windowMs: readPositiveIntegerEnv("AUTH_LOGIN_WINDOW_MINUTES", defaultLoginThrottleConfig.windowMs / 60000) * 60000,
    lockoutMs:
      readPositiveIntegerEnv("AUTH_LOGIN_LOCKOUT_MINUTES", defaultLoginThrottleConfig.lockoutMs / 60000) * 60000
  };
}

function normalizeThrottleEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeThrottleIp(ip: string | null | undefined) {
  const normalized = ip?.trim();
  return normalized ? normalized : null;
}

function resetThrottleEntry(map: Map<string, LoginThrottleEntry>, key: string) {
  map.delete(key);
}

function getThrottleEntry(
  map: Map<string, LoginThrottleEntry>,
  key: string,
  config: LoginThrottleConfig,
  now: number
) {
  const entry = map.get(key);
  if (!entry) {
    return null;
  }

  if (entry.lockedUntil && entry.lockedUntil <= now) {
    resetThrottleEntry(map, key);
    return null;
  }

  if (!entry.lockedUntil && now - entry.windowStartedAt >= config.windowMs) {
    resetThrottleEntry(map, key);
    return null;
  }

  return entry;
}

function getThrottleStatusForScope(
  map: Map<string, LoginThrottleEntry>,
  key: string | null,
  scope: "email" | "ip",
  config: LoginThrottleConfig,
  now: number
): LoginThrottleResult | null {
  if (!key) {
    return null;
  }

  const entry = getThrottleEntry(map, key, config, now);
  if (!entry?.lockedUntil || entry.lockedUntil <= now) {
    return null;
  }

  return {
    throttled: true,
    scope,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.lockedUntil - now) / 1000))
  };
}

function recordFailureForScope(
  map: Map<string, LoginThrottleEntry>,
  key: string | null,
  config: LoginThrottleConfig,
  now: number
) {
  if (!key) {
    return;
  }

  const current = getThrottleEntry(map, key, config, now);
  if (!current) {
    map.set(key, {
      attempts: 1,
      windowStartedAt: now,
      lockedUntil: config.maxAttempts <= 1 ? now + config.lockoutMs : null
    });
    return;
  }

  if (current.lockedUntil && current.lockedUntil > now) {
    return;
  }

  const attempts = current.attempts + 1;
  map.set(key, {
    attempts,
    windowStartedAt: current.windowStartedAt,
    lockedUntil: attempts >= config.maxAttempts ? now + config.lockoutMs : null
  });
}

export function createPasswordHash(password: string, salt = crypto.randomBytes(16).toString("base64url")) {
  const key = crypto.scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
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
  const configuredUsers = getAuthConfig(process.env, { requireUsers: true }).usersJson;
  if (!configuredUsers) {
    return fallbackCredentialUsers;
  }

  try {
    const parsed = JSON.parse(configuredUsers) as CredentialUser[];
    return parsed.filter((user) => sessionUserSchema.safeParse(user).success && (user.password || user.passwordHash));
  } catch {
    return [];
  }
}

export function getLoginThrottleStatus(input: { email?: string | null; ip?: string | null }, now = Date.now()) {
  const config = getLoginThrottleConfig();
  const emailStatus = getThrottleStatusForScope(
    emailLoginThrottle,
    normalizeThrottleEmail(input.email),
    "email",
    config,
    now
  );

  if (emailStatus) {
    return emailStatus;
  }

  return (
    getThrottleStatusForScope(ipLoginThrottle, normalizeThrottleIp(input.ip), "ip", config, now) ?? {
      throttled: false,
      scope: null,
      retryAfterSeconds: 0
    }
  );
}

export function recordFailedLoginAttempt(input: { email?: string | null; ip?: string | null }, now = Date.now()) {
  const config = getLoginThrottleConfig();
  recordFailureForScope(emailLoginThrottle, normalizeThrottleEmail(input.email), config, now);
  recordFailureForScope(ipLoginThrottle, normalizeThrottleIp(input.ip), config, now);
  return getLoginThrottleStatus(input, now);
}

export function resetLoginThrottle(input: { email?: string | null; ip?: string | null }) {
  const normalizedEmail = normalizeThrottleEmail(input.email);
  if (normalizedEmail) {
    resetThrottleEntry(emailLoginThrottle, normalizedEmail);
  }

  const normalizedIp = normalizeThrottleIp(input.ip);
  if (normalizedIp) {
    resetThrottleEntry(ipLoginThrottle, normalizedIp);
  }
}

export function resetLoginThrottleState() {
  emailLoginThrottle.clear();
  ipLoginThrottle.clear();
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
      role: userRoleSchema.catch("employee").parse(databaseUser.role)
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

  const parsed = signupRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid signup request.");
  }

  const { name, email, password, role } = parsed.data;

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
    passwordHash: createPasswordHash(password)
  });

  return user;
}
