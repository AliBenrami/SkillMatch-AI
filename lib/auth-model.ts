import crypto from "node:crypto";

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
