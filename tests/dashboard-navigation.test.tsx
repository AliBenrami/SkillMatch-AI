import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/app/dashboard";
import type { SessionUser } from "@/lib/auth-model";

function userWithRole(role: SessionUser["role"]): SessionUser {
  return {
    name: "Demo User",
    email: `${role}@skillmatch.demo`,
    role
  };
}

function navButton(name: string) {
  return within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name });
}

function navButtonDomMatches(name: string) {
  const navigation = screen.getByRole("navigation", { name: "Sections" });
  return Array.from(navigation.querySelectorAll("button")).filter(
    (button) => button.textContent?.replace(/\s+/g, " ").trim() === name
  );
}

function okJson(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200
    })
  );
}

function mockDashboardFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/candidates")) {
        return okJson({ candidates: [] });
      }
      if (url.includes("/api/analyses")) {
        return okJson({ analyses: [] });
      }
      if (url.includes("/api/saved-roles")) {
        return okJson({ savedRoles: [] });
      }
      if (url.includes("/api/audit")) {
        return okJson({ events: [] });
      }
      return okJson({ ok: true });
    })
  );
}

describe("dashboard role navigation", () => {
  beforeEach(() => {
    mockDashboardFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows recruiter candidate analysis screens and hides learning and audit screens", () => {
    render(<Dashboard user={userWithRole("recruiter")} />);

    expect(navButton("Dashboard")).toBeEnabled();
    expect(navButton("Analyses")).toBeEnabled();
    expect(navButton("Workforce")).toBeEnabled();
    expect(navButton("Settings")).toBeEnabled();
    expect(navButtonDomMatches("Learning")).toHaveLength(0);
    expect(navButtonDomMatches("Audit Log")).toHaveLength(0);
  });

  it("shows learning development progress screens without recruiter workforce or audit controls", () => {
    render(<Dashboard user={userWithRole("learning_development")} />);

    expect(navButton("Dashboard")).toBeEnabled();
    expect(navButton("Analyses")).toBeEnabled();
    expect(navButton("Learning")).toBeEnabled();
    expect(navButton("Settings")).toBeEnabled();
    expect(navButtonDomMatches("Workforce")).toHaveLength(0);
    expect(navButtonDomMatches("Audit Log")).toHaveLength(0);
  });

  it("enables system administrators for recruiter, learning, and audit areas", () => {
    render(<Dashboard user={userWithRole("system_admin")} />);

    for (const label of ["Dashboard", "Analyses", "Learning", "Workforce", "Audit Log", "Settings"]) {
      expect(navButton(label)).toBeEnabled();
    }
  });

  it("shows a restricted state when a recruiter opens learning directly", () => {
    render(<Dashboard user={userWithRole("recruiter")} initialView="learning" />);

    expect(screen.getByRole("heading", { name: "Restricted access: Learning" })).toBeVisible();
    expect(screen.getByText("Current role: recruiter")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Learning Module Assignments" })).not.toBeInTheDocument();
  });

  it("shows a restricted state when learning development opens audit directly", () => {
    render(<Dashboard user={userWithRole("learning_development")} initialView="audit" />);

    expect(screen.getByRole("heading", { name: "Restricted access: Audit Log" })).toBeVisible();
    expect(screen.getByText("Current role: learning development")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Audit Log" })).not.toBeInTheDocument();
  });
});
