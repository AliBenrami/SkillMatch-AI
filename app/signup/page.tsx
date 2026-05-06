"use client";

import { useEffect, useState } from "react";
import { AmazonLogo } from "../components/amazon-brand";

type SignupAvailability = "checking" | "available" | "demo-memory" | "database-unavailable";

type HealthPayload = {
  database?: {
    configured?: boolean;
    schemaReady?: boolean;
  };
};

export default function SignupPage() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availability, setAvailability] = useState<SignupAvailability>("checking");
  const signupDisabled = availability !== "available";

  useEffect(() => {
    let cancelled = false;

    async function checkSignupAvailability() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as HealthPayload;
        if (cancelled) {
          return;
        }

        if (!payload.database?.configured) {
          setAvailability("demo-memory");
          return;
        }

        setAvailability(payload.database.schemaReady ? "available" : "database-unavailable");
      } catch {
        if (!cancelled) {
          setAvailability("database-unavailable");
        }
      }
    }

    void checkSignupAvailability();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signup(formData: FormData) {
    if (signupDisabled) {
      setError("Signup requires a configured database. Use demo credentials on the sign-in page for local demo mode.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        role: String(formData.get("role") ?? "employee")
      }),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      window.location.href = "/";
      return;
    }

    const payload = (await response.json()) as { error?: string };
    setError(payload.error ?? "Signup failed.");
    setIsSubmitting(false);
  }

  return (
    <main className="login-shell">
      <form
        className="login-card"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          void signup(new FormData(event.currentTarget));
        }}
      >
        <div className="brand login-brand">
          <AmazonLogo />
        </div>
        <h1>Create Talent Match account</h1>
        <p>Sign up with your email and role when persistent database storage is configured.</p>
        {availability === "checking" ? (
          <p className="auth-helper-panel" role="status">Checking signup availability...</p>
        ) : null}
        {availability === "demo-memory" ? (
          <section className="auth-helper-panel" role="status" aria-live="polite">
            <strong>Signup is not available in demo memory mode.</strong>
            <p>
              This local workspace is running without <code>DATABASE_URL</code>, so new accounts cannot be saved.
              Sign in with the demo recruiter, admin, or learning credentials instead.
            </p>
            <a href="/login">Go to sign in</a>
          </section>
        ) : null}
        {availability === "database-unavailable" ? (
          <section className="auth-helper-panel" role="alert">
            <strong>Signup is not configured for this environment.</strong>
            <p>
              Account creation needs a ready Postgres schema. Use demo credentials or finish database setup before
              creating users.
            </p>
            <a href="/login">Use normal sign in</a>
          </section>
        ) : null}

        <label>
          Name
          <input name="name" type="text" autoComplete="name" required disabled={signupDisabled || isSubmitting} />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required disabled={signupDisabled || isSubmitting} />
        </label>
        <label>
          Role
          <select name="role" defaultValue="employee" disabled={signupDisabled || isSubmitting}>
            <option value="employee">Employee</option>
            <option value="recruiter">Recruiter</option>
            <option value="hiring_manager">Hiring manager</option>
            <option value="learning_development">Learning and development</option>
          </select>
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            disabled={signupDisabled || isSubmitting}
          />
        </label>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={signupDisabled || isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <a className="auth-link" href="/login">Sign in instead</a>
      </form>
    </main>
  );
}
