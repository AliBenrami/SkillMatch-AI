import { sessionUserSchema } from "./validation";

const localDemoSecret = "skillmatch-ai-local-demo-secret";

const weakSecrets = new Set([
  localDemoSecret,
  "replace-with-a-long-random-secret",
  "changeme",
  "password",
  "secret"
]);

type StorageConfig =
  | {
      provider: "local";
    }
  | {
      provider: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      publicBaseUrl: string | null;
    };

function readEnvValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return value ? value : null;
}

function isProductionEnvironment(env: NodeJS.ProcessEnv) {
  return env.NODE_ENV === "production";
}

function createEnvError(...issues: string[]) {
  return new Error(`Invalid runtime environment:\n- ${issues.join("\n- ")}`);
}

function isStrongSecret(value: string) {
  return value.length >= 32 && new Set(value).size >= 8 && !weakSecrets.has(value.toLowerCase());
}

function validateCredentialUsersJson(value: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw createEnvError("AUTH_USERS_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw createEnvError("AUTH_USERS_JSON must be a non-empty JSON array.");
  }

  for (const user of parsed) {
    const password = typeof user === "object" && user ? (user as Record<string, unknown>).password : undefined;
    const passwordHash =
      typeof user === "object" && user ? (user as Record<string, unknown>).passwordHash : undefined;
    const hasPassword =
      (typeof password === "string" && password.trim().length > 0) ||
      (typeof passwordHash === "string" && passwordHash.trim().length > 0);

    if (!sessionUserSchema.safeParse(user).success || !hasPassword) {
      throw createEnvError(
        "AUTH_USERS_JSON users must include valid name, email, role, and password or passwordHash values."
      );
    }
  }
}

export function getAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { requireUsers?: boolean } = {}
) {
  const configuredSecret = readEnvValue(env, "AUTH_SECRET") ?? readEnvValue(env, "BETTER_AUTH_SECRET");
  const usersJson = readEnvValue(env, "AUTH_USERS_JSON");
  const production = isProductionEnvironment(env);
  const requireUsers = options.requireUsers ?? true;

  if (configuredSecret && production && !isStrongSecret(configuredSecret)) {
    throw createEnvError("AUTH_SECRET must be a strong random value of at least 32 characters in production.");
  }

  if (usersJson) {
    validateCredentialUsersJson(usersJson);
  } else if (production && requireUsers) {
    throw createEnvError("AUTH_USERS_JSON must be configured in production instead of using demo users.");
  }

  if (configuredSecret) {
    return {
      secret: configuredSecret,
      usersJson,
      usesLocalDemoSecret: false,
      usesFallbackUsers: !usersJson
    };
  }

  if (production) {
    throw createEnvError("AUTH_SECRET or BETTER_AUTH_SECRET must be set to a strong random value in production.");
  }

  return {
    secret: localDemoSecret,
    usersJson,
    usesLocalDemoSecret: true,
    usesFallbackUsers: !usersJson
  };
}

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = readEnvValue(env, "DATABASE_URL");

  if (!databaseUrl && isProductionEnvironment(env)) {
    throw createEnvError("DATABASE_URL must be configured in production.");
  }

  return {
    url: databaseUrl,
    usesMemoryFallback: !databaseUrl
  };
}

export function getStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const accountId = readEnvValue(env, "R2_ACCOUNT_ID");
  const accessKeyId = readEnvValue(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = readEnvValue(env, "R2_SECRET_ACCESS_KEY");
  const bucket = readEnvValue(env, "R2_BUCKET");
  const publicBaseUrl = readEnvValue(env, "R2_PUBLIC_BASE_URL");

  const requiredEntries = [
    ["R2_ACCOUNT_ID", accountId],
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_BUCKET", bucket]
  ] as const;

  const configuredCount = requiredEntries.filter(([, value]) => value).length;
  if (configuredCount > 0 && configuredCount < requiredEntries.length) {
    const missingKeys = requiredEntries.filter(([, value]) => !value).map(([key]) => key);
    throw createEnvError(`R2 storage configuration is incomplete. Missing: ${missingKeys.join(", ")}.`);
  }

  if (configuredCount === 0) {
    if (isProductionEnvironment(env)) {
      throw createEnvError(
        "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be configured in production."
      );
    }

    return { provider: "local" };
  }

  return {
    provider: "r2",
    accountId: accountId as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
    publicBaseUrl
  };
}

export function validateRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return {
    auth: getAuthConfig(env, { requireUsers: true }),
    database: getDatabaseConfig(env),
    storage: getStorageConfig(env)
  };
}
