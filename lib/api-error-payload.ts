export type ApiErrorHint = "migrate" | "contact_admin";

export type ApiErrorPayload = {
  error: string;
  code?: string;
  hint?: ApiErrorHint;
};
