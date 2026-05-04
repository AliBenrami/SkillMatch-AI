import type { SessionUser } from "./auth-model";

export type AccessArea = "admin" | "recruiter" | "learning";

export function canAccess(user: Pick<SessionUser, "role"> | null, area: AccessArea) {
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

export const canAccessArea = canAccess;
