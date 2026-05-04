"use client";

import { useState } from "react";
import { AmazonLogo } from "../components/amazon-brand";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(formData: FormData) {
    setError("");
    setIsSubmitting(true);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? "")
      }),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      window.location.href = "/";
      return;
    }

    const payload = (await response.json()) as { error?: string };
    setError(payload.error ?? "Sign in failed.");
    setIsSubmitting(false);
  }

  return (
    <main className="login-shell">
      <form
        className="login-card"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          void login(new FormData(event.currentTarget));
        }}
      >
        <div className="brand login-brand">
          <AmazonLogo />
        </div>
        <h1>Talent Match sign in</h1>
        <p>Use the demo credentials provided for this SkillMatch workspace.</p>

        <label>
          Email
          <input name="email" type="email" autoComplete="email" placeholder="recruiter@skillmatch.demo" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        <a className="auth-link" href="/signup">Create an account</a>
      </form>
    </main>
  );
}
