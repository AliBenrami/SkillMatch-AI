"use client";

import { ShieldCheck } from "lucide-react";
import { demoUsers } from "@/lib/auth-model";

export default function LoginPage() {
  async function login(formData: FormData) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(formData.get("email") ?? ""),
        role: String(formData.get("role") ?? "")
      }),
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      window.location.href = "/";
    }
  }

  return (
    <main className="login-shell">
      <form action={login} className="login-card">
        <div className="brand login-brand">
          <ShieldCheck aria-hidden="true" />
          <span>SkillMatch AI</span>
        </div>
        <h1>Amazon SSO access</h1>
        <p>Demo single sign-on gate for internal users and role-based access control.</p>

        <label>
          Internal account
          <select name="email" defaultValue={demoUsers[0].email}>
            {demoUsers.map((user) => (
              <option key={user.email} value={user.email}>
                {user.name} - {user.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role claim
          <select name="role" defaultValue={demoUsers[0].role}>
            {demoUsers.map((user) => (
              <option key={user.role} value={user.role}>
                {user.role.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-action" type="submit">
          Sign in with Amazon
        </button>
      </form>
    </main>
  );
}
