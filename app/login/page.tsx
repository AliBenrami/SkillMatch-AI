"use client";

import { useState } from "react";
import { AmazonLogo } from "../components/amazon-brand";

const demoAccounts = [
  {
    label: "Recruiter",
    email: "recruiter@skillmatch.demo",
    password: "SkillMatchDemo!23"
  },
  {
    label: "System admin",
    email: "admin@skillmatch.demo",
    password: "SkillMatchAdmin!23"
  },
  {
    label: "Learning & development",
    email: "learning@skillmatch.demo",
    password: "SkillMatchLearn!23"
  }
];

export default function LoginPage() {
  const [error, setError] = useState("");
  const [email, setEmail] = useState("recruiter@skillmatch.demo");
  const [password, setPassword] = useState("");
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
        <p>Use a configured account or one of the demo credentials for this SkillMatch workspace.</p>

        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="recruiter@skillmatch.demo"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
        <section className="demo-credentials" aria-label="Demo credentials">
          <h2>Demo credentials</h2>
          {demoAccounts.map((account) => (
            <button
              className="demo-account-button"
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
                setError("");
              }}
            >
              <span>
                <strong>{account.label}</strong>
                <small>{account.email}</small>
              </span>
              <code>{account.password}</code>
            </button>
          ))}
        </section>
        <a className="auth-link" href="/signup">Create an account</a>
      </form>
    </main>
  );
}
