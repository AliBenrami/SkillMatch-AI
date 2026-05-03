import { z } from "zod";
import { roles } from "./seed-data";

export const userRoleSchema = z.enum([
  "employee",
  "recruiter",
  "hiring_manager",
  "learning_development",
  "system_admin"
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const sessionUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  role: userRoleSchema
});

export const signedSessionPayloadSchema = sessionUserSchema.extend({
  iat: z.number().int(),
  exp: z.number().int()
}).refine((session) => session.iat <= session.exp, {
  message: "Session issue time must be before expiration."
});

export const loginRequestSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

export const signupRequestSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(10, "Use a password with at least 10 characters."),
  role: userRoleSchema.default("employee")
});

export const roleIdSchema = z.enum(
  roles.map((role) => role.id) as [string, ...string[]],
  { message: "Select a valid Amazon role." }
);

export const analyzeRequestSchema = z.object({
  employeeName: z.string().trim().min(1).default("Demo Employee"),
  resumeText: z.string().trim().min(20, "Resume text must include at least 20 characters."),
  roleId: roleIdSchema.default("sde-i")
});

export const overrideRequestSchema = z.object({
  candidateId: z.string().trim().min(1, "Candidate is required."),
  promotedRole: roleIdSchema,
  reason: z.string().trim().min(3).default("Manual review")
});

export function parseJsonRequest<T>(schema: z.ZodType<T>, body: unknown) {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { data: parsed.data, error: null };
  }

  return {
    data: null,
    error: parsed.error.issues[0]?.message ?? "Invalid request."
  };
}

export async function parseJsonRequestBody<T>(schema: z.ZodType<T>, request: Pick<Request, "json">) {
  try {
    return parseJsonRequest(schema, await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        data: null,
        error: "Malformed JSON body."
      };
    }

    throw error;
  }
}

export function isKnownRoleId(value: string) {
  return roleIdSchema.safeParse(value).success;
}
