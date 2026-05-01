"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function signup(formData: FormData) {
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
      <form action={signup} className="login-card">
        <div className="brand login-brand">
          <UserPlus aria-hidden="true" />
          <span>SkillMatch AI</span>
        </div>
        <h1>Create account</h1>
        <p>Sign up with a database-backed account for this environment.</p>

        <label>
          Name
          <input name="name" type="text" autoComplete="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Role
          <select name="role" defaultValue="employee">
            <option value="employee">Employee</option>
            <option value="recruiter">Recruiter</option>
            <option value="hiring_manager">Hiring manager</option>
            <option value="learning_development">Learning and development</option>
          </select>
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
        <a className="auth-link" href="/login">Sign in instead</a>
      </form>
    </main>
  );
}
