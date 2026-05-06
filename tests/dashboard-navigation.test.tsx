import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/app/dashboard";
import type { SessionUser } from "@/lib/auth-model";
import type { CandidateAnalysis } from "@/lib/skillmatch";

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

function createCandidate(): CandidateAnalysis {
  return {
    id: "cand-1",
    candidateName: "Alex Smith",
    fileName: "Alex-Smith.pdf",
    storageUrl: "local://resumes/alex.pdf",
    structured: {
      skills: ["java", "aws", "sql"],
      yearsExperience: 5,
      education: ["Bachelor's degree"],
      location: "Seattle, WA",
      certifications: [],
      biasMaskedText: "masked"
    },
    topPositions: [
      {
        role: {
          id: "sde-ii",
          title: "Software Development Engineer II",
          level: "Mid",
          department: "Amazon Stores",
          family: "Software Engineering",
          location: "Seattle, WA",
          requiredSkills: [],
          preferredSkills: [],
          requiredCertifications: [],
          preferredCertifications: [],
          minimumYearsExperience: 3,
          idealYearsExperience: 5,
          requiredSoftSkills: [],
          preferredSoftSkills: [],
          learning: {}
        },
        extractedSkills: ["java", "aws", "sql"],
        structured: {
          skills: ["java", "aws", "sql"],
          yearsExperience: 5,
          education: ["Bachelor's degree"],
          location: "Seattle, WA",
          certifications: [],
          biasMaskedText: "masked"
        },
        matchedSkills: ["java", "aws", "sql"],
        missingSkills: [],
        score: 88,
        explanation: "Strong match",
        explanationDetails: {
          weights: {
            requiredSkill: 2,
            preferredSkill: 1,
            requiredCertification: 2,
            preferredCertification: 1,
            experience: 2,
            requiredSoftSkill: 1,
            preferredSoftSkill: 1
          },
          earnedWeight: 8,
          possibleWeight: 10,
          requiredSkills: { matched: 0, total: 0, missing: [] },
          preferredSkills: { matched: 0, total: 0, missing: [] },
          softSkills: { matched: 0, total: 0, missing: [] },
          certifications: { matched: 0, total: 0, matchedItems: [], missing: [] },
          experience: {
            candidateYears: 5,
            minimumYears: 3,
            idealYears: 5,
            earnedWeight: 2,
            meetsMinimum: true,
            meetsIdeal: true
          },
          evidence: [],
          rankingFactors: []
        },
        rank: 1
      }
    ],
    aiInsight: null,
    assignedLearningModules: [],
    createdAt: "2026-05-06T00:00:00.000Z"
  };
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
      if (url.includes("/api/learning-report")) {
        return okJson({
          report: {
            generatedAt: "2026-05-06T00:00:00.000Z",
            totalCandidates: 0,
            topMissingSkills: [],
            byDepartment: [],
            byEmployeeGroup: [],
            byRoleFamily: []
          }
        });
      }
      if (url.includes("/api/admin-alerts")) {
        return okJson({ alerts: [] });
      }
      if (url.includes("/api/health")) {
        return okJson({
          status: "ok",
          database: {
            configured: false,
            mode: "memory",
            schemaReady: false,
            missingTables: [],
            missingColumns: []
          },
          storage: {
            configured: false,
            provider: "local",
            mode: "local_memory",
            persistent: false,
            publicBaseUrlConfigured: false,
            objectDeletionSupported: true
          }
        });
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

  it("shows recruiter candidate analysis screens and hides L&D workforce, learning, and audit screens", () => {
    render(<Dashboard user={userWithRole("recruiter")} />);

    expect(navButton("Dashboard")).toBeEnabled();
    expect(navButton("Analyses")).toBeEnabled();
    expect(navButton("Settings")).toBeEnabled();
    expect(navButtonDomMatches("Learning")).toHaveLength(0);
    expect(navButtonDomMatches("Workforce")).toHaveLength(0);
    expect(navButtonDomMatches("Audit Log")).toHaveLength(0);
  });

  it("shows learning development progress and workforce screens without audit controls", () => {
    render(<Dashboard user={userWithRole("learning_development")} />);

    expect(navButton("Dashboard")).toBeEnabled();
    expect(navButton("Analyses")).toBeEnabled();
    expect(navButton("Learning")).toBeEnabled();
    expect(navButton("Workforce")).toBeEnabled();
    expect(navButton("Settings")).toBeEnabled();
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

  it("renders useful settings information for a signed-in demo user", async () => {
    render(<Dashboard user={userWithRole("learning_development")} initialView="settings" />);

    expect(screen.getByRole("heading", { name: "Account summary" })).toBeVisible();
    expect(screen.getAllByText("learning_development@skillmatch.demo")[0]).toBeVisible();
    expect(screen.getByRole("heading", { name: "Upload preferences" })).toBeVisible();
    expect(screen.getByText(/Accepted files: PDF, DOCX, TXT, ZIP/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Role access summary" })).toBeVisible();
    expect(screen.getByText(/Visible to this role: Dashboard, Analyses, Learning, Workforce, Settings/)).toBeVisible();
    expect(await screen.findByText("Memory database fallback")).toBeVisible();
  });

  it("runs the candidate delete flow from the analyses UI", async () => {
    const user = userEvent.setup();
    const candidate = createCandidate();
    let deleted = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/candidates/cand-1") && init?.method === "DELETE") {
        deleted = true;
        return okJson({
          deleted: true,
          candidateId: "cand-1",
          candidateName: "Alex Smith",
          fileName: "Alex-Smith.pdf",
          storageUrl: "local://resumes/alex.pdf",
          resumeObjectDeleted: true,
          resumeObjectDeletionSupported: true,
          mode: "local_memory"
        });
      }
      if (url.includes("/api/candidates")) {
        return okJson({ candidates: deleted ? [] : [candidate] });
      }
      if (url.includes("/api/analyses")) {
        return okJson({ analyses: [] });
      }
      if (url.includes("/api/saved-roles")) {
        return okJson({ savedRoles: [] });
      }
      if (url.includes("/api/health")) {
        return okJson({
          status: "ok",
          database: {
            configured: false,
            mode: "memory",
            schemaReady: false,
            missingTables: [],
            missingColumns: []
          },
          storage: {
            configured: false,
            provider: "local",
            mode: "local_memory",
            persistent: false,
            publicBaseUrlConfigured: false,
            objectDeletionSupported: true
          }
        });
      }
      return okJson({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<Dashboard user={userWithRole("recruiter")} initialView="analyses" />);

    expect(await screen.findByRole("heading", { name: "Alex Smith" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete resume for Alex Smith" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/candidates/cand-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(globalThis.confirm).toHaveBeenCalled();
    expect(await screen.findByText("Deleted resume record for Alex Smith.")).toBeVisible();
  });
});
