"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, KeyboardEvent } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookmarkCheck,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  Search,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { roles, type RoleRequirement } from "@/lib/seed-data";
import type { SessionUser } from "@/lib/auth-model";
import { canAccess, type AccessArea } from "@/lib/auth-permissions";
import type {
  AnalysisRecord,
  AuditEvent,
  CandidateDuplicateWarning,
  SavedTargetRole,
} from "@/lib/db";
import type { CandidateAnalysis } from "@/lib/skillmatch";

type UploadResponse = {
  candidates: CandidateAnalysis[];
  failures: Array<{ fileName: string; error: string }>;
  duplicates?: CandidateDuplicateWarning[];
  persistError?: string;
};

type SkillGapChartItem = {
  skill: string;
  source: "required" | "preferred";
  status: "matched" | "gap";
  importance: "critical" | "important";
  coverage: number;
};

type View =
  | "dashboard"
  | "analyses"
  | "learning"
  | "workforce"
  | "audit"
  | "settings";

type LoadStatus = "loading" | "ready" | "forbidden" | "error";
type NavAccess = "all" | "candidate_analysis" | AccessArea;

const navItems: Array<{
  id: View;
  label: string;
  icon: LucideIcon;
  access: NavAccess;
}> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, access: "all" },
  {
    id: "analyses",
    label: "Analyses",
    icon: BarChart3,
    access: "candidate_analysis",
  },
  { id: "learning", label: "Learning", icon: BookOpen, access: "learning" },
  { id: "workforce", label: "Workforce", icon: Users, access: "recruiter" },
  { id: "audit", label: "Audit Log", icon: ShieldCheck, access: "admin" },
  { id: "settings", label: "Settings", icon: Settings, access: "all" },
];

const viewIds = new Set<View>(navItems.map((item) => item.id));

function parseView(value?: string): View | null {
  return value && viewIds.has(value as View) ? (value as View) : null;
}

function canOpenAccess(user: SessionUser, access: NavAccess) {
  if (access === "all") {
    return true;
  }
  if (access === "candidate_analysis") {
    return canAccess(user, "recruiter") || canAccess(user, "learning");
  }

  return canAccess(user, access);
}

function canOpenView(user: SessionUser, view: View) {
  return canOpenAccess(
    user,
    navItems.find((item) => item.id === view)?.access ?? "all",
  );
}

function getRestrictedViewCopy(view: View) {
  if (view === "analyses") {
    return {
      title: "Analyses",
      text: "Recruiters, hiring managers, learning and development, and system administrators can view organization-wide analysis history.",
    };
  }
  if (view === "learning") {
    return {
      title: "Learning",
      text: "Learning and development or system administrator access is required to assign modules to saved candidate resumes.",
    };
  }
  if (view === "workforce") {
    return {
      title: "Workforce",
      text: "Recruiter, hiring manager, or system administrator access is required for workforce-level role coverage.",
    };
  }
  return {
    title: "Audit Log",
    text: "System administrators can view login, upload, recommendation, and recruiter override events.",
  };
}

async function readApiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error ?? fallback;
}

const technologyOptions = Array.from(
  new Set(
    roles.flatMap((role) => [...role.requiredSkills, ...role.preferredSkills]),
  ),
).sort((a, b) =>
  formatTechnologyLabel(a).localeCompare(formatTechnologyLabel(b)),
);

const educationOptions = [
  "High school",
  "Associate",
  "Bachelor",
  "Master",
  "MBA",
  "PhD",
  "Bootcamp",
  "Certification",
];

function formatTechnologyLabel(value: string) {
  const specialLabels: Record<string, string> = {
    "api design": "API Design",
    aws: "AWS",
    "ci cd": "CI/CD",
    docker: "Docker",
    excel: "Excel",
    git: "Git",
    java: "Java",
    javascript: "JavaScript",
    kubernetes: "Kubernetes",
    node: "Node.js",
    postgresql: "PostgreSQL",
    python: "Python",
    react: "React",
    "rest api": "REST API",
    sql: "SQL",
    tableau: "Tableau",
    typescript: "TypeScript",
  };
  return (
    specialLabels[value.toLowerCase()] ??
    value.replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function parseFilterValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function serializeFilterValues(values: string[]) {
  return values.join(", ");
}

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function candidateHasStoredResumeFile(
  candidate: Pick<CandidateAnalysis, "storageUrl" | "fileName">,
) {
  return Boolean(candidate.storageUrl?.trim() && candidate.fileName?.trim());
}

function learningModuleId(roleId: string, skill: string) {
  return `${roleId}:${skill}`;
}

function CandidateResumeFileLinks({
  candidate,
}: {
  candidate: CandidateAnalysis;
}) {
  if (!candidateHasStoredResumeFile(candidate)) {
    return null;
  }
  const hrefBase = `/api/candidates/${candidate.id}/resume`;
  const isPdf = candidate.fileName.toLowerCase().endsWith(".pdf");
  return (
    <span className="candidate-resume-links">
      <a
        className="resume-download-link"
        href={`${hrefBase}?view=1`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View résumé
      </a>
      <span className="candidate-resume-links-sep" aria-hidden="true">
        ·
      </span>
      <a className="resume-download-link" href={hrefBase}>
        {isPdf ? "Download PDF" : "Download file"}
      </a>
    </span>
  );
}

export default function Dashboard({
  user,
  enableE2eFileHook = false,
  initialView,
}: {
  user: SessionUser;
  enableE2eFileHook?: boolean;
  initialView?: string;
}) {
  const [view, setView] = useState<View>(
    () => parseView(initialView) ?? "dashboard",
  );
  const [roleId, setRoleId] = useState("sde-ii");
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<CandidateAnalysis[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [savedRoles, setSavedRoles] = useState<SavedTargetRole[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [failures, setFailures] = useState<UploadResponse["failures"]>([]);
  const [uploadDuplicateWarnings, setUploadDuplicateWarnings] = useState<
    CandidateDuplicateWarning[]
  >([]);
  const [overrideCandidate, setOverrideCandidate] =
    useState<CandidateAnalysis | null>(null);
  const [manualRestrictedView, setManualRestrictedView] = useState<
    View | null
  >(() => {
    const parsedView = parseView(initialView);
    return parsedView && !canOpenView(user, parsedView) ? parsedView : null;
  });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedLearningCandidateId, setSelectedLearningCandidateId] =
    useState<string>("");
  const [learningRoleOverrides, setLearningRoleOverrides] = useState<
    Record<string, string>
  >({});
  const [learningAssignmentStatus, setLearningAssignmentStatus] = useState<
    "idle" | "saving"
  >("idle");
  const [isUploading, setIsUploading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [candidateStatus, setCandidateStatus] =
    useState<LoadStatus>("loading");
  const [analysisHistoryStatus, setAnalysisHistoryStatus] =
    useState<LoadStatus>("loading");
  const [savedRolesStatus, setSavedRolesStatus] =
    useState<LoadStatus>("loading");
  const [auditStatus, setAuditStatus] = useState<LoadStatus>(
    canAccess(user, "admin") ? "loading" : "forbidden",
  );
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [educationFilter, setEducationFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [minYearsFilter, setMinYearsFilter] = useState("");
  const [settingsProfile, setSettingsProfile] = useState({
    displayName: user.name,
    email: user.email,
    team: "Learning Development",
    region: "North America",
    defaultRoleId: roleId,
    reviewThreshold: "70",
    weeklyDigest: true,
    auditCopy: user.role === "system_admin",
  });
  const serverFiltersRef = useRef({
    skill: "",
    education: "",
    location: "",
    minYears: "",
  });

  useEffect(() => {
    serverFiltersRef.current = {
      skill: skillFilter,
      education: educationFilter,
      location: locationFilter,
      minYears: minYearsFilter,
    };
  }, [educationFilter, locationFilter, minYearsFilter, skillFilter]);

  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ??
    candidates[0];
  const selectedLearningCandidate =
    candidates.find(
      (candidate) => candidate.id === selectedLearningCandidateId,
    ) ?? selectedCandidate;
  const selectedLearningRoleId =
    (selectedLearningCandidate
      ? learningRoleOverrides[selectedLearningCandidate.id]
      : undefined) ??
    selectedLearningCandidate?.topPositions[0]?.role.id ??
    roles[0].id;
  const selectedLearningRole =
    roles.find((role) => role.id === selectedLearningRoleId) ?? roles[0];
  const selectedLearningMatch =
    selectedLearningCandidate?.topPositions.find(
      (item) => item.role.id === selectedLearningRole.id,
    ) ?? selectedLearningCandidate?.topPositions[0];
  const selectedRoleMatch = selectedCandidate?.topPositions.find(
    (item) => item.role.id === roleId,
  );
  const bestRecommendation =
    selectedRoleMatch ?? selectedCandidate?.topPositions[0];
  const selectedResult = selectedRoleMatch ?? bestRecommendation;

  const savedCurrentRole = savedRoles.find((role) => role.roleId === roleId);
  const accessibleNavItems = useMemo(
    () => navItems.filter((item) => canOpenAccess(user, item.access)),
    [user],
  );
  const firstAccessibleView = accessibleNavItems[0]?.id ?? "dashboard";
  const userCanViewAnalysisHistory =
    canAccess(user, "recruiter") || canAccess(user, "learning");
  const userCanViewAudit = canAccess(user, "admin");
  const activeViewAllowed = canOpenView(user, view);
  const showRestrictedView =
    !activeViewAllowed && manualRestrictedView === view;
  const screenView: View | null = showRestrictedView
    ? null
    : activeViewAllowed
      ? view
      : firstAccessibleView;

  const workforceGaps = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((candidate) => {
      candidate.topPositions[0]?.missingSkills.slice(0, 5).forEach((gap) => {
        counts.set(gap.skill, (counts.get(gap.skill) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [candidates]);

  const dashboardStats = useMemo(() => {
    const roleCounts = new Map<string, number>();
    let scoreTotal = 0;
    let scoreCount = 0;
    let assignedModules = 0;

    candidates.forEach((candidate) => {
      const bestRole = candidate.topPositions[0];
      if (bestRole) {
        roleCounts.set(
          bestRole.role.title,
          (roleCounts.get(bestRole.role.title) ?? 0) + 1,
        );
        scoreTotal += bestRole.score;
        scoreCount += 1;
      }
      assignedModules += candidate.assignedLearningModules?.length ?? 0;
    });

    return {
      resumeCount: candidates.length,
      averageMatch: scoreCount ? Math.round(scoreTotal / scoreCount) : 0,
      assignedModules,
      activeRoleFamilies: roles.length,
      roleDistribution: Array.from(roleCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    };
  }, [candidates]);

  const workforceGapMeterMax = Math.max(files.length, candidates.length, 5);

  const skillGapChartItems = useMemo<SkillGapChartItem[]>(() => {
    if (!selectedResult) {
      return [];
    }

    const matchedSkills = new Set(selectedResult.matchedSkills);
    const missingSkills = new Map(
      selectedResult.missingSkills.map((gap) => [gap.skill, gap]),
    );

    return [
      ...selectedRole.requiredSkills,
      ...selectedRole.preferredSkills,
    ].map((skill) => {
      const source: SkillGapChartItem["source"] =
        selectedRole.requiredSkills.includes(skill) ? "required" : "preferred";
      const isMatched = matchedSkills.has(skill);
      const missingGap = missingSkills.get(skill);

      return {
        skill,
        source,
        status: isMatched ? "matched" : "gap",
        importance:
          missingGap?.importance ??
          (source === "required" ? "critical" : "important"),
        coverage: isMatched ? 100 : source === "required" ? 32 : 56,
      };
    });
  }, [selectedRole, selectedResult]);

  const filteredCandidates = candidates.filter((candidate) =>
    `${candidate.candidateName} ${candidate.fileName} ${candidate.topPositions[0]?.role.title ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  const hasActiveServerCandidateFilters = Boolean(
    skillFilter.trim() ||
    educationFilter.trim() ||
    locationFilter.trim() ||
    minYearsFilter.trim(),
  );

  const refreshRecords = useCallback(
    async (options?: {
      skipCandidates?: boolean;
      forceEmptyCandidateFilters?: boolean;
    }) => {
      const candidateParams = new URLSearchParams();
      const useServerFilters = !options?.forceEmptyCandidateFilters;
      if (useServerFilters) {
        skillFilter
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean)
          .forEach((skill) => candidateParams.append("skill", skill));
        if (educationFilter.trim()) {
          candidateParams.set("education", educationFilter.trim());
        }
        if (locationFilter.trim()) {
          candidateParams.set("location", locationFilter.trim());
        }
        if (minYearsFilter.trim()) {
          candidateParams.set("minYearsExperience", minYearsFilter.trim());
        }
      }

      const candidateQuery = candidateParams.size
        ? `?${candidateParams.toString()}`
        : "";
      const skipCandidates = Boolean(options?.skipCandidates);
      const errors: string[] = [];

      setIsRefreshing(true);
      setRefreshError("");
      if (!skipCandidates) {
        setCandidateStatus("loading");
      }
      setAnalysisHistoryStatus(
        userCanViewAnalysisHistory ? "loading" : "forbidden",
      );
      setSavedRolesStatus("loading");
      setAuditStatus(userCanViewAudit ? "loading" : "forbidden");

      try {
        const [
          candidateResponse,
          analysisResponse,
          savedRolesResponse,
          auditResponse,
        ] = await Promise.all([
          skipCandidates
            ? Promise.resolve(null)
            : fetch(`/api/candidates${candidateQuery}`),
          userCanViewAnalysisHistory
            ? fetch("/api/analyses")
            : Promise.resolve(null),
          fetch("/api/saved-roles"),
          userCanViewAudit ? fetch("/api/audit") : Promise.resolve(null),
        ]);

        if (candidateResponse) {
          if (candidateResponse.ok) {
            const payload = (await candidateResponse.json()) as {
              candidates: CandidateAnalysis[];
            };
            setCandidates(payload.candidates);
            setCandidateStatus("ready");
            setSelectedCandidateId((current) => {
              const ids = new Set(payload.candidates.map((c) => c.id));
              if (!payload.candidates.length) {
                return "";
              }
              if (current && ids.has(current)) {
                return current;
              }
              return payload.candidates[0]!.id;
            });
            setSelectedLearningCandidateId((current) => {
              const ids = new Set(payload.candidates.map((c) => c.id));
              if (!payload.candidates.length) {
                return "";
              }
              if (current && ids.has(current)) {
                return current;
              }
              return payload.candidates[0]!.id;
            });
          } else if (candidateResponse.status === 403) {
            setCandidateStatus("forbidden");
            errors.push("Candidate records are restricted for this role.");
          } else {
            setCandidateStatus("error");
            errors.push(
              await readApiError(
                candidateResponse,
                `Could not load candidates (HTTP ${candidateResponse.status}).`,
              ),
            );
          }
        }

        if (analysisResponse) {
          if (analysisResponse.ok) {
            const payload = (await analysisResponse.json()) as {
              analyses: AnalysisRecord[];
            };
            setAnalyses(payload.analyses);
            setAnalysisHistoryStatus("ready");
          } else if (analysisResponse.status === 403) {
            setAnalyses([]);
            setAnalysisHistoryStatus("forbidden");
            if (userCanViewAnalysisHistory) {
              errors.push(
                "Analysis history access was denied unexpectedly.",
              );
            }
          } else {
            setAnalysisHistoryStatus("error");
            errors.push(
              await readApiError(
                analysisResponse,
                `Could not load analysis history (HTTP ${analysisResponse.status}).`,
              ),
            );
          }
        } else {
          setAnalyses([]);
        }

        if (savedRolesResponse.ok) {
          const payload = (await savedRolesResponse.json()) as {
            savedRoles: SavedTargetRole[];
          };
          setSavedRoles(payload.savedRoles);
          setSavedRolesStatus("ready");
        } else {
          setSavedRolesStatus("error");
          errors.push(
            await readApiError(
              savedRolesResponse,
              `Could not load saved target roles (HTTP ${savedRolesResponse.status}).`,
            ),
          );
        }

        if (auditResponse) {
          if (auditResponse.ok) {
            const payload = (await auditResponse.json()) as {
              events: AuditEvent[];
            };
            setAuditEvents(payload.events);
            setAuditStatus("ready");
          } else if (auditResponse.status === 403) {
            setAuditEvents([]);
            setAuditStatus("forbidden");
            if (userCanViewAudit) {
              errors.push("Audit log access was denied unexpectedly.");
            }
          } else {
            setAuditStatus("error");
            errors.push(
              await readApiError(
                auditResponse,
                `Could not load audit log (HTTP ${auditResponse.status}).`,
              ),
            );
          }
        } else {
          setAuditEvents([]);
        }

        if (errors.length) {
          const message = errors.join(" ");
          setRefreshError(message);
          setNotice(message);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not refresh dashboard data.";
        setRefreshError(message);
        setNotice(message);
        if (!skipCandidates) {
          setCandidateStatus("error");
        }
        if (userCanViewAnalysisHistory) {
          setAnalysisHistoryStatus("error");
        }
        setSavedRolesStatus("error");
        if (userCanViewAudit) {
          setAuditStatus("error");
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [
      educationFilter,
      locationFilter,
      minYearsFilter,
      skillFilter,
      userCanViewAnalysisHistory,
      userCanViewAudit,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshRecords]);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) {
      return;
    }
    const nextFiles = Array.from(fileList).filter((file) =>
      /\.(pdf|docx|txt|zip)$/i.test(file.name),
    );
    setFiles((current) => {
      const queued = new Set(current.map(fileKey));
      const uniqueFiles = nextFiles.filter((file) => {
        const key = fileKey(file);
        if (queued.has(key)) {
          return false;
        }
        queued.add(key);
        return true;
      });
      return [...current, ...uniqueFiles].slice(0, 12);
    });
  }, []);

  useEffect(() => {
    if (!enableE2eFileHook) {
      return;
    }
    const win = window as Window & {
      __skillmatchE2eSyncQueuedFilesFromInput?: () => void;
    };
    win.__skillmatchE2eSyncQueuedFilesFromInput = () => {
      const input = document.querySelector<HTMLInputElement>(
        ".upload-panel input[type=file]",
      );
      if (!input?.files?.length) {
        return;
      }
      addFiles(input.files);
    };
    return () => {
      delete win.__skillmatchE2eSyncQueuedFilesFromInput;
    };
  }, [addFiles, enableE2eFileHook]);

  function removeFile(fileToRemove: File) {
    const removeKey = fileKey(fileToRemove);
    setFiles((current) =>
      current.filter((file) => fileKey(file) !== removeKey),
    );
  }

  function clearFiles() {
    setFiles([]);
  }

  async function uploadResumes() {
    if (!files.length) {
      setNotice("Select at least one resume before running analysis.");
      return;
    }

    setIsUploading(true);
    setNotice("");
    setFailures([]);
    setUploadDuplicateWarnings([]);

    const formData = new FormData();
    files.forEach((file) => formData.append("resumes", file));

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      const contentType = response.headers.get("content-type") ?? "";

      let payload: unknown;

      if (contentType.includes("application/json")) {
        try {
          payload = await response.json();
        } catch {
          setNotice(
            `Upload failed (${response.status}). The server returned invalid JSON.`,
          );
          return;
        }
      } else {
        const text = await response.text();
        if (/__next_error__|DOCTYPE/i.test(text)) {
          setNotice(
            `Upload failed (${response.status}). The app returned an HTML error page instead of JSON — check server logs (storage, database, or migrations).`,
          );
          return;
        }
        const snippet = text.trim().slice(0, 200);
        setNotice(
          snippet
            ? `Upload failed (${response.status}). ${snippet}`
            : `Upload failed (${response.status}).`,
        );
        return;
      }

      if (!response.ok) {
        const errBody = payload as { error?: string; hint?: string };
        const migrateHelp =
          errBody.hint === "migrate"
            ? " Run database migrations if you use Neon/Postgres."
            : "";
        setNotice(
          (errBody.error ?? `Upload failed (${response.status}).`) +
            migrateHelp,
        );
        return;
      }

      const uploadPayload = payload as UploadResponse;
      const duplicatesFromResponse = uploadPayload.duplicates ?? [];
      setCandidates((current) => [...uploadPayload.candidates, ...current]);
      const newestUploadedId = uploadPayload.candidates.at(-1)?.id;
      setSelectedCandidateId(newestUploadedId ?? selectedCandidateId);
      setFailures(uploadPayload.failures);
      setUploadDuplicateWarnings(duplicatesFromResponse);

      const duplicates = duplicatesFromResponse;
      const dupPhrase =
        duplicates.length > 0
          ? duplicates.length === 1
            ? ` 1 duplicate or cluster warning.`
            : ` ${duplicates.length} duplicate or cluster warnings.`
          : "";

      const persistWarn = uploadPayload.persistError?.trim();
      let message =
        uploadPayload.candidates.length > 0
          ? `Processed ${uploadPayload.candidates.length} resume${uploadPayload.candidates.length === 1 ? "" : "s"}.${dupPhrase}`
          : `No resumes were processed.${dupPhrase}`;
      if (persistWarn) {
        message +=
          uploadPayload.candidates.length > 0
            ? ` Results were analyzed but could not be saved: ${persistWarn}`
            : ` ${persistWarn}`;
      }

      const prevFilters = serverFiltersRef.current;
      const hadServerFilters = Boolean(
        prevFilters.skill.trim() ||
        prevFilters.education.trim() ||
        prevFilters.location.trim() ||
        prevFilters.minYears.trim(),
      );
      if (
        uploadPayload.candidates.length > 0 &&
        !persistWarn &&
        hadServerFilters
      ) {
        message +=
          " Candidate filters were cleared so new uploads stay visible under Analyses.";
        setSkillFilter("");
        setEducationFilter("");
        setLocationFilter("");
        setMinYearsFilter("");
      }

      setNotice(message);

      setFiles([]);

      if (uploadPayload.candidates.length > 0 && !persistWarn) {
        void refreshRecords({
          skipCandidates: false,
          forceEmptyCandidateFilters: true,
        });
      } else {
        void refreshRecords({ skipCandidates: Boolean(persistWarn) });
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Upload failed unexpectedly.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function saveCurrentTargetRole() {
    const response = await fetch("/api/saved-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId,
        targetScore: 80,
        currentScore: selectedResult?.score ?? null,
        matchedSkills,
        missingSkills: missingSkills.map((gap) => gap.skill),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setNotice(payload.error ?? "Could not bookmark this role for Learning.");
      return;
    }

    const payload = (await response.json()) as { savedRole: SavedTargetRole };
    setSavedRoles((current) => [
      payload.savedRole,
      ...current.filter((role) => role.id !== payload.savedRole.id),
    ]);
    setNotice(
      `Pinned "${selectedRole.title}" for Learning. Candidate analyses stay under Analyses.`,
    );
  }

  async function removeSavedRole(id: string) {
    const response = await fetch(`/api/saved-roles?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setSavedRoles((current) => current.filter((role) => role.id !== id));
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setNotice(payload.error ?? "Could not remove this bookmark. Try again.");
  }

  async function assignLearningModule(moduleId: string, assigned: boolean) {
    if (!selectedLearningCandidate) {
      setNotice("Select a resume before assigning learning modules.");
      return;
    }

    const currentModules = new Set(
      selectedLearningCandidate.assignedLearningModules ?? [],
    );
    if (assigned) {
      currentModules.add(moduleId);
    } else {
      currentModules.delete(moduleId);
    }

    setLearningAssignmentStatus("saving");
    const response = await fetch(
      `/api/candidates/${selectedLearningCandidate.id}/learning-modules`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleIds: Array.from(currentModules) }),
      },
    );

    setLearningAssignmentStatus("idle");
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setNotice(payload.error ?? "Could not update learning assignments.");
      return;
    }

    const payload = (await response.json()) as { candidate: CandidateAnalysis };
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === payload.candidate.id ? payload.candidate : candidate,
      ),
    );
    setNotice(
      `Updated learning modules for ${payload.candidate.candidateName}.`,
    );
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const matchedSkills = selectedResult?.matchedSkills ?? [];
  const missingSkills = selectedResult?.missingSkills ?? [];
  const userCanSubmitRecruiterOverride = canAccess(user, "recruiter");

  const updateViewUrl = useCallback((nextView: View) => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (nextView === "dashboard") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", nextView);
    }
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  function selectView(nextView: View) {
    const resolvedView = canOpenView(user, nextView)
      ? nextView
      : firstAccessibleView;
    setManualRestrictedView(null);
    setView(resolvedView);
    updateViewUrl(resolvedView);
  }

  useEffect(() => {
    if (screenView && screenView !== view) {
      updateViewUrl(screenView);
    }
  }, [screenView, updateViewUrl, view]);

  return (
    <main className="product-shell">
      <div className="product-layout">
        <header className="app-header">
          <div className="brand-block">
            <div className="brand-title">
              <h1>SkillMatch AI</h1>
              <p className="brand-tagline">Resume analysis and role fit</p>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="icon-text-button"
              type="button"
              disabled={isUploading || isRefreshing}
              title={
                isUploading
                  ? "Wait for upload to finish before refreshing."
                  : "Reload candidates, bookmarks, analysis history, and audit data"
              }
              onClick={() => void refreshRecords()}
            >
              <RefreshCw aria-hidden="true" />
              {isRefreshing ? "Refreshing..." : "Refresh data"}
            </button>
            <span className="session-meta">
              {user.name}
              <span className="session-meta-role">
                {user.role.replace("_", " ")}
              </span>
            </span>
            <button className="icon-text-button" type="button" onClick={logout}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

        <nav className="top-nav" aria-label="Sections">
          {accessibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`top-nav-item ${screenView === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => selectView(item.id)}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <section className="main-product">
          {isRefreshing ? (
            <div className="refresh-status" role="status" aria-live="polite">
              <RefreshCw aria-hidden="true" />
              Refreshing workspace data...
            </div>
          ) : null}
          {refreshError ? (
            <div className="refresh-alert" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>{refreshError}</span>
              <button
                className="icon-text-button"
                type="button"
                disabled={isRefreshing}
                onClick={() => void refreshRecords()}
              >
                <RefreshCw aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : null}

          {showRestrictedView ? <RestrictedView user={user} view={view} /> : null}
          {screenView === "dashboard" ? (
            <>
              <section className="concept-grid dashboard-workbench">
                <section className="concept-panel upload-panel dashboard-left-rail">
                  <h2>Upload resumes</h2>
                  <div
                    className="drop-zone"
                    onDrop={(event) => {
                      event.preventDefault();
                      addFiles(event.dataTransfer.files);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                  >
                    <UploadCloud aria-hidden="true" />
                    <strong>Drop PDF, DOCX, TXT, or ZIP resumes here</strong>
                    <span>or click to browse</span>
                    <input
                      aria-label="Upload resume files"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt,.zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/zip,application/x-zip-compressed"
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <div className="queue-header">
                    <span>
                      {files.length
                        ? `${files.length} selected`
                        : "No resumes selected"}
                    </span>
                    <button
                      className="queue-clear-button"
                      type="button"
                      onClick={clearFiles}
                      disabled={!files.length || isUploading}
                    >
                      <Trash2 aria-hidden="true" />
                      Clear all
                    </button>
                  </div>
                  <ul className="file-list">
                    {files.map((file) => (
                      <li key={fileKey(file)}>
                        <CheckCircle2 aria-hidden="true" />
                        <span>{file.name}</span>
                        <small>{Math.round(file.size / 1024)} KB</small>
                        <button
                          className="queue-icon-button"
                          type="button"
                          onClick={() => removeFile(file)}
                          disabled={isUploading}
                          aria-label={`Remove ${file.name}`}
                          title={`Remove ${file.name}`}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="role-facts">
                    <label className="role-context">
                      Comparison role
                      <select
                        value={roleId}
                        onChange={(event) => setRoleId(event.target.value)}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <h3>Role context</h3>
                    <p>Job Family: {selectedRole.family}</p>
                    <p>Business Unit: {selectedRole.department}</p>
                    <p>Level: {selectedRole.level}</p>
                    <p>
                      Experience: {selectedRole.minimumYearsExperience} to{" "}
                      {selectedRole.idealYearsExperience}+ years
                    </p>
                    <p>
                      Certifications:{" "}
                      {selectedRole.requiredCertifications
                        .concat(selectedRole.preferredCertifications)
                        .join(", ") || "None specified"}
                    </p>
                    <p>
                      Soft skills:{" "}
                      {selectedRole.requiredSoftSkills
                        .concat(selectedRole.preferredSoftSkills)
                        .join(", ")}
                    </p>
                  </div>
                  {notice ? <p className="notice">{notice}</p> : null}
                  {failures.map((failure) => (
                    <p className="error-message" key={failure.fileName}>
                      {failure.fileName}: {failure.error}
                    </p>
                  ))}
                  {uploadDuplicateWarnings.length > 0 ? (
                    <div
                      data-testid="upload-duplicate-advisory"
                      className="rounded-lg border border-border-strong bg-brand-light px-3 py-2.5 text-[13px] text-ink"
                      role="region"
                      aria-label="Duplicate resume notices"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="font-semibold">
                            Duplicate / cluster notices
                          </strong>
                          <span className="mt-1 block font-normal leading-snug text-muted">
                            These files matched an existing uploaded résumé or
                            another file in this run. Ranking did not store a
                            new row until you resolve overlaps.
                          </span>
                        </div>
                        <button
                          type="button"
                          className="queue-icon-button shrink-0"
                          aria-label="Dismiss duplicate notices"
                          title="Dismiss"
                          onClick={() => setUploadDuplicateWarnings([])}
                        >
                          <X aria-hidden={true} />
                        </button>
                      </div>
                      <ul className="upload-duplicate-list mt-3 list-none space-y-1.5 p-0 font-medium">
                        {uploadDuplicateWarnings.map((dup) => (
                          <li
                            key={`${dup.fileName}:${dup.duplicateKey}:${dup.clusterKey}:${dup.source}`}
                          >
                            <span className="text-ink">{dup.fileName}</span>
                            <span className="text-muted"> — {dup.message}</span>
                            {dup.matchedFileName ? (
                              <span className="text-muted">
                                {" "}
                                ({dup.matchedFileName})
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <button
                    className="run-button"
                    onClick={uploadResumes}
                    disabled={isUploading || !files.length}
                    title={
                      !files.length
                        ? "Add at least one résumé file (PDF, DOCX, TXT, or ZIP) to run analysis."
                        : undefined
                    }
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    {isUploading
                      ? "Processing resumes..."
                      : "Run SkillMatch Analysis"}
                  </button>
                  <RecommendationPanel candidate={selectedCandidate} compact />
                </section>

                <section className="concept-panel overview-panel dashboard-main-panel">
                  <div className="panel-heading">
                    <h2>Skill Match Overview</h2>
                    {selectedCandidate ? (
                      <span className="overview-panel-candidate-heading">
                        <span>{selectedCandidate.candidateName}</span>
                        <CandidateResumeFileLinks
                          candidate={selectedCandidate}
                        />
                      </span>
                    ) : null}
                  </div>
                  <div className="overview-content">
                    <div className="overview-summary">
                      <div
                        className={`score-column${selectedResult ? "" : " is-empty"}`}
                      >
                        <div
                          className="score-ring large"
                          style={
                            {
                              "--score": `${selectedResult?.score ?? 0}%`,
                            } as CSSProperties
                          }
                          aria-label={
                            selectedResult
                              ? `Match score ${selectedResult.score}%`
                              : "No match score yet"
                          }
                        >
                          <strong>
                            {selectedResult ? `${selectedResult.score}%` : "—"}
                          </strong>
                        </div>
                        <strong>Overall Match</strong>
                        <span>
                          {selectedResult
                            ? selectedRole.title
                            : "Upload resumes to rank positions"}
                        </span>
                      </div>
                      <SkillList
                        title="Top Matched Skills"
                        items={matchedSkills.slice(0, 8)}
                      />
                      <ReadinessSignals result={selectedResult} />
                      <GapList gaps={missingSkills.slice(0, 8)} />
                    </div>
                    <DashboardStatsPanel stats={dashboardStats} />
                    <DashboardGapPanel gaps={workforceGaps} />
                    <RoleSkillGapChart
                      candidateName={selectedCandidate?.candidateName}
                      items={skillGapChartItems}
                      roleTitle={selectedRole.title}
                    />
                  </div>
                </section>

                <aside className="right-stack dashboard-right-rail">
                  <SavedTargetRolesPanel
                    currentRoleSaved={Boolean(savedCurrentRole)}
                    roles={savedRoles}
                    status={savedRolesStatus}
                    bookmarkDisabled={!selectedResult}
                    bookmarkDisabledReason="Run analysis on at least one résumé to snapshot match scores for this role."
                    onRemove={removeSavedRole}
                    onSave={saveCurrentTargetRole}
                    onSelect={(id) => {
                      setRoleId(id);
                      selectView("learning");
                    }}
                  />
                  <AiInsightPanel insight={selectedCandidate?.aiInsight ?? null} />
                  <RecentCandidates
                    candidates={candidates}
                    onSelect={setSelectedCandidateId}
                  />
                </aside>
              </section>
            </>
          ) : null}

          {screenView === "analyses" ? (
            <section className="screen-stack">
              <div className="screen-toolbar">
                <label className="search-box">
                  <Search aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search candidates"
                  />
                </label>
                <button
                  className="icon-text-button"
                  disabled={isRefreshing}
                  onClick={() => void refreshRecords()}
                >
                  <RefreshCw aria-hidden="true" />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div className="filter-toolbar" aria-label="Candidate filters">
                <TechnologyChipFilter
                  label="Skills"
                  options={technologyOptions}
                  placeholder="Type Java, AWS, React..."
                  selectedValues={parseFilterValues(skillFilter)}
                  onChange={(values) =>
                    setSkillFilter(serializeFilterValues(values))
                  }
                />
                <label>
                  Education
                  <select
                    value={educationFilter}
                    onChange={(event) => setEducationFilter(event.target.value)}
                  >
                    <option value="">Any education</option>
                    {educationOptions.map((education) => (
                      <option key={education} value={education}>
                        {education}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Location
                  <input
                    value={locationFilter}
                    onChange={(event) => setLocationFilter(event.target.value)}
                    placeholder="Seattle"
                  />
                </label>
                <label>
                  Min years
                  <input
                    min="0"
                    type="number"
                    value={minYearsFilter}
                    onChange={(event) => setMinYearsFilter(event.target.value)}
                    placeholder="3"
                  />
                </label>
              </div>
              <section className="data-grid">
                {candidateStatus === "loading" ? (
                  <LoadingPanel
                    title="Loading candidates"
                    text="Refreshing saved candidate recommendations and filters."
                  />
                ) : null}
                {candidateStatus === "error" && candidates.length === 0 ? (
                  <ErrorPanel
                    title="Could not load candidates"
                    text="The candidate list did not refresh. Try again in a moment."
                    onRetry={() => void refreshRecords()}
                  />
                ) : null}
                {candidateStatus === "error" && candidates.length > 0 ? (
                  <div
                    className="error-message col-span-full m-0 mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px]"
                    role="alert"
                  >
                    <span>
                      Could not refresh candidates. Showing the last loaded
                      analyses.
                    </span>
                    <button
                      className="icon-text-button"
                      type="button"
                      disabled={isRefreshing}
                      onClick={() => void refreshRecords()}
                    >
                      <RefreshCw aria-hidden="true" />
                      {isRefreshing ? "Refreshing..." : "Retry candidates"}
                    </button>
                  </div>
                ) : null}
                {candidateStatus === "forbidden" ? (
                  <EmptyPanel
                    title="Candidate records are restricted"
                    text="Your current role cannot view saved candidate recommendations."
                  />
                ) : null}
                {candidateStatus !== "loading" && candidateStatus !== "forbidden"
                  ? filteredCandidates.map((candidate) => (
                      <article className="candidate-card" key={candidate.id}>
                        <div className="panel-heading">
                          <h2>{candidate.candidateName}</h2>
                          <em className="status-chip">
                            {candidate.topPositions[0]?.score ?? 0}%
                          </em>
                        </div>
                        <p>
                          {candidate.fileName}{" "}
                          <CandidateResumeFileLinks candidate={candidate} />
                        </p>
                        <strong style={{ fontSize: "13px" }}>
                          {candidate.topPositions[0]?.role.title ??
                            "No recommendation"}
                        </strong>
                        <span className="candidate-meta">
                          {candidate.structured.skills.slice(0, 4).join(", ") ||
                            "No skills extracted"}
                          {candidate.structured.location
                            ? ` | ${candidate.structured.location}`
                            : ""}
                          {candidate.structured.yearsExperience !== null
                            ? ` | ${candidate.structured.yearsExperience} yrs`
                            : ""}
                        </span>
                        <small>{candidate.topPositions[0]?.explanation}</small>
                        {userCanSubmitRecruiterOverride ? (
                          <button
                            type="button"
                            className="icon-text-button mt-3 text-left self-start"
                            onClick={() => setOverrideCandidate(candidate)}
                          >
                            Flag recruiter override (audit-only)
                          </button>
                        ) : null}
                      </article>
                    ))
                  : null}
                {candidateStatus === "ready" && !filteredCandidates.length ? (
                  candidates.length > 0 ? (
                    <EmptyPanel
                      title="No matching candidates"
                      text="None of the candidates currently loaded match. Clear the search box or loosen Skill / Location / Education / Min years, then Refresh."
                    />
                  ) : hasActiveServerCandidateFilters ? (
                    <EmptyPanel
                      title="No candidates match these filters"
                      text="The server returned no rows for your Skill / Location / Education / Min years filters. Clear or loosen them and press Refresh—you may have excluded an upload you just processed."
                    />
                  ) : (
                    <EmptyPanel
                      title="No candidate analyses yet"
                      text="No candidates yet—upload from the Dashboard tab. Analyses are available after you process résumés."
                    />
                  )
                ) : null}
              </section>
              <HistoryTable
                analyses={analyses}
                isRefreshing={isRefreshing}
                onRetry={() => void refreshRecords()}
                status={analysisHistoryStatus}
              />
            </section>
          ) : null}

          {screenView === "learning" ? (
            <section className="screen-stack learning-screen">
              <div className="screen-toolbar learning-toolbar">
                <div>
                  <h2>Learning plans</h2>
                  <p>
                    Review every uploaded resume, confirm the best-fit training
                    target, and assign modules to that employee.
                  </p>
                </div>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => void refreshRecords()}
                >
                  <RefreshCw aria-hidden="true" />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <section className="learning-layout">
                <LearningResumeRoster
                  candidates={candidates}
                  selectedCandidateId={selectedLearningCandidate?.id ?? ""}
                  onSelect={setSelectedLearningCandidateId}
                />
                <LearningAssignmentPanel
                  busy={learningAssignmentStatus === "saving"}
                  candidate={selectedLearningCandidate}
                  onRoleChange={(nextRoleId) => {
                    if (!selectedLearningCandidate) {
                      return;
                    }
                    setLearningRoleOverrides((current) => ({
                      ...current,
                      [selectedLearningCandidate.id]: nextRoleId,
                    }));
                  }}
                  onToggle={(moduleId, assigned) =>
                    void assignLearningModule(moduleId, assigned)
                  }
                  role={selectedLearningRole}
                  selectedMatch={selectedLearningMatch}
                />
              </section>
              <section className="metric-grid">
                <Metric label="Saved target roles" value={savedRoles.length} />
                <Metric
                  label="Current role progress"
                  value={
                    savedCurrentRole
                      ? `${savedCurrentRole.progressPercent}%`
                      : "Not saved"
                  }
                />
                <Metric
                  label="Assigned modules"
                  value={
                    selectedLearningCandidate?.assignedLearningModules?.length ??
                    0
                  }
                />
              </section>
              <SavedRoleProgress
                roles={savedRoles}
                status={savedRolesStatus}
                onRemove={removeSavedRole}
                onSelect={setRoleId}
              />
            </section>
          ) : null}

          {screenView === "workforce" ? (
            <section className="screen-stack">
              <div className="screen-toolbar">
                <span className="text-[13px] text-muted">
                  Counts reflect analyzed candidates from this workspace.
                </span>
                <button
                  className="icon-text-button"
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => void refreshRecords()}
                >
                  <RefreshCw aria-hidden="true" />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <section className="metric-grid">
                <Metric label="Open role families" value={roles.length} />
                <Metric label="Candidates reviewed" value={candidates.length} />
                <Metric
                  label="Tracked skill gaps"
                  value={
                    workforceGaps.length || selectedRole.requiredSkills.length
                  }
                />
              </section>
              <section className="concept-panel">
                <div className="panel-heading">
                  <h2>Role Coverage Matrix</h2>
                  <span>Seed catalog (demo)</span>
                </div>
                <p className="m-0 mb-3 text-[12px] leading-snug text-muted">
                  Roles and skills come from bundled seed data—not live
                  headcount or ATS openings.
                </p>
                <div className="role-matrix">
                  {roles.map((role) => (
                    <article key={role.id}>
                      <strong>{role.title}</strong>
                      <span>{role.department}</span>
                      <small>
                        {role.requiredSkills.slice(0, 5).join(", ")}
                      </small>
                    </article>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-4 shadow-md md:p-[clamp(1rem,1.15vw,1.125rem)]">
                <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-border pb-3">
                  <h2 className="m-0 text-[15px] font-bold tracking-tight text-[#0f172a]">
                    Common skill gaps
                  </h2>
                  <span className="max-w-xs text-end text-xs font-semibold leading-snug text-muted sm:max-w-sm">
                    {selectedRole.title}
                  </span>
                </div>
                <p className="m-0 text-[13px] leading-relaxed text-muted">
                  Aggregated missing skills from recent analyses (when
                  available).
                  {!workforceGaps.length && !candidates.length ? (
                    <span className="block pt-2 font-medium text-ink">
                      Illustrative gaps from the selected role&apos;s
                      requirements appear below until résumé analyses exist.
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-col gap-3">
                  {(workforceGaps.length
                    ? workforceGaps
                    : selectedRole.requiredSkills
                        .slice(0, 5)
                        .map(
                          (skill, index) =>
                            [skill, 5 - index] as [string, number],
                        )
                  ).map(([skill, count]) => (
                    <div
                      key={skill}
                      className="grid grid-cols-1 items-center gap-x-4 gap-y-2 min-[460px]:grid-cols-[minmax(7rem,8.5rem)_minmax(0,1fr)_2.75rem]"
                    >
                      <span className="truncate text-[13px] font-medium capitalize text-ink min-[460px]:row-auto">
                        {skill}
                      </span>
                      <meter
                        className="col-span-full min-h-[6px] w-full min-w-0 appearance-none min-[460px]:col-auto"
                        value={Number(count)}
                        min={0}
                        max={workforceGapMeterMax}
                      />
                      <strong className="text-left text-[13px] font-bold tabular-nums text-muted min-[460px]:text-end">
                        {Number(count)}
                      </strong>
                    </div>
                  ))}
                </div>
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy={isUploading && files.length > 0}
                  className="mt-0.5 flex items-start gap-3 border-t border-border pt-3"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel text-subtle ring-1 ring-border"
                    aria-hidden={true}
                  >
                    <Activity className="size-[17px]" strokeWidth={2} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-subtle">
                      Browser upload staging
                    </span>
                    <p className="m-0 text-[13px] font-medium leading-snug text-ink">
                      {isUploading && files.length > 0 ? (
                        <>
                          <span className="font-semibold text-brand">
                            {files.length}
                          </span>{" "}
                          file
                          {files.length === 1 ? "" : "s"} queued in this browser
                          before analysis runs—not a server job queue.
                        </>
                      ) : (
                        <span className="text-muted">
                          Nothing staged in your browser queue.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          {screenView === "audit" ? (
            <section className="screen-stack">
              <section className="concept-panel audit-log-panel">
                <div className="panel-heading">
                  <h2>Audit Log</h2>
                  <span>
                    {userCanViewAudit
                      ? `${auditEvents.length} events`
                      : "Admin only"}
                  </span>
                </div>
                {userCanViewAudit ? (
                  <>
                    <div className="mb-3 flex flex-wrap justify-end gap-2">
                      <button
                        className="icon-text-button"
                        type="button"
                        disabled={isRefreshing}
                        onClick={() => void refreshRecords()}
                      >
                        <RefreshCw aria-hidden="true" />
                        {isRefreshing ? "Refreshing..." : "Refresh log"}
                      </button>
                    </div>
                    <AuditTable
                      events={auditEvents}
                      isRefreshing={isRefreshing}
                      onRetry={() => void refreshRecords()}
                      status={auditStatus}
                    />
                  </>
                ) : (
                  <EmptyPanel
                    title="Restricted screen"
                    text="System administrators can view login, upload, and override events."
                  />
                )}
              </section>
            </section>
          ) : null}

          {screenView === "settings" ? (
            <section className="screen-stack">
              <form
                className="concept-panel settings-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice("Settings saved for this session.");
                }}
              >
                <section className="settings-section">
                  <div className="panel-heading">
                    <h2>Profile</h2>
                    <span>{user.role.replace("_", " ")}</span>
                  </div>
                  <label>
                    Full name
                    <input
                      value={settingsProfile.displayName}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Work email
                    <input
                      type="email"
                      value={settingsProfile.email}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Team
                    <input
                      value={settingsProfile.team}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          team: event.target.value,
                        }))
                      }
                    />
                  </label>
                </section>

                <section className="settings-section">
                  <div className="panel-heading">
                    <h2>Analysis Defaults</h2>
                    <span>Workspace</span>
                  </div>
                  <label>
                    Hiring region
                    <select
                      value={settingsProfile.region}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          region: event.target.value,
                        }))
                      }
                    >
                      <option>North America</option>
                      <option>EMEA</option>
                      <option>APAC</option>
                      <option>LATAM</option>
                    </select>
                  </label>
                  <label>
                    Default comparison role
                    <select
                      value={settingsProfile.defaultRoleId}
                      onChange={(event) => {
                        setRoleId(event.target.value);
                        setSettingsProfile((current) => ({
                          ...current,
                          defaultRoleId: event.target.value,
                        }));
                      }}
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review threshold
                    <select
                      value={settingsProfile.reviewThreshold}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          reviewThreshold: event.target.value,
                        }))
                      }
                    >
                      <option value="60">60% match</option>
                      <option value="70">70% match</option>
                      <option value="80">80% match</option>
                      <option value="90">90% match</option>
                    </select>
                  </label>
                </section>

                <section className="settings-section settings-wide-section">
                  <div className="panel-heading">
                    <h2>Notifications & Access</h2>
                    <span>Session only</span>
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settingsProfile.weeklyDigest}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          weeklyDigest: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>Weekly learning digest</strong>
                      <small>
                        Send a concise summary of assigned modules, unresolved
                        gaps, and newly uploaded resumes.
                      </small>
                    </span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settingsProfile.auditCopy}
                      onChange={(event) =>
                        setSettingsProfile((current) => ({
                          ...current,
                          auditCopy: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <strong>Copy me on override activity</strong>
                      <small>
                        Notify this account when recruiter overrides or learning
                        assignments are recorded.
                      </small>
                    </span>
                  </label>
                  <div className="settings-actions">
                    <p>
                      Changes here personalize this browser session and do not
                      modify server account records.
                    </p>
                    <button className="primary-action" type="submit">
                      Save settings
                    </button>
                  </div>
                </section>
              </form>
            </section>
          ) : null}
        </section>
      </div>

      <RecruiterOverrideModal
        key={overrideCandidate?.id ?? "closed"}
        candidate={overrideCandidate}
        onClose={() => setOverrideCandidate(null)}
        refreshRecords={() => void refreshRecords()}
        onRecordedNotice={(note) => setNotice(note)}
      />
    </main>
  );
}

function RecruiterOverrideModal({
  candidate,
  onClose,
  refreshRecords,
  onRecordedNotice,
}: {
  candidate: CandidateAnalysis | null;
  onClose: () => void;
  refreshRecords: () => void | Promise<void>;
  onRecordedNotice: (note: string) => void;
}) {
  if (!candidate) {
    return null;
  }

  return (
    <RecruiterOverrideModalInner
      candidate={candidate}
      onClose={onClose}
      refreshRecords={refreshRecords}
      onRecordedNotice={onRecordedNotice}
    />
  );
}

function RecruiterOverrideModalInner({
  candidate,
  onClose,
  refreshRecords,
  onRecordedNotice,
}: {
  candidate: CandidateAnalysis;
  onClose: () => void;
  refreshRecords: () => void | Promise<void>;
  onRecordedNotice: (note: string) => void;
}) {
  const [promotedRoleId, setPromotedRoleId] = useState(
    () => candidate.topPositions[0]?.role.id ?? roles[0].id,
  );
  const [reason, setReason] = useState(
    "Cross-team priority after panel review.",
  );
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMsg("");
    try {
      const response = await fetch("/api/override", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          promotedRole: promotedRoleId,
          reason,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setErrorMsg(payload.error ?? "Override request failed.");
        return;
      }
      onRecordedNotice(
        "Recruiter override logged to the audit trail. In this demo it does not alter stored match scores.",
      );
      await refreshRecords();
      onClose();
    } catch {
      setErrorMsg("Override request failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      aria-labelledby="override-dialog-title"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md rounded-lg border border-border bg-panel p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2
          id="override-dialog-title"
          className="m-0 text-base font-bold text-ink"
        >
          Flag recruiter override
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          This records a decision in the audit log for stakeholders. It does{" "}
          <strong>not</strong> rewrite stored SkillMatch scores yet.
        </p>
        <p className="mt-1 text-[12px] text-subtle">
          Candidate:{" "}
          <span className="font-semibold text-ink">
            {candidate.candidateName}
          </span>{" "}
          · file {candidate.fileName}
        </p>
        <label className="role-context mt-4">
          Promoted role emphasis
          <select
            value={promotedRoleId}
            onChange={(e) => setPromotedRoleId(e.target.value)}
            required
            disabled={busy}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
        </label>
        <label className="role-context mt-3">
          Reason (shown in audit metadata)
          <textarea
            className="min-h-[76px] w-full resize-y rounded-[var(--radius-sm)] border border-border bg-panel px-3 py-2 text-[13px] font-medium text-ink"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            minLength={3}
          />
        </label>
        {errorMsg ? (
          <p className="error-message mt-3" role="alert">
            {errorMsg}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="icon-text-button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="run-button mt-0 max-w-none min-h-[38px]"
            disabled={busy}
          >
            {busy ? "Recording…" : "Record audit entry"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SkillList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>
        <CheckCircle2 aria-hidden="true" />
        {title}
      </h3>
      {items.length ? (
        <ul className="match-table">
          {items.map((skill) => (
            <li key={skill}>
              <span>{skill}</span>
              <small>Matched</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="list-placeholder">
          Upload a resume to see matched skills.
        </p>
      )}
    </div>
  );
}

function GapList({
  gaps,
}: {
  gaps: CandidateAnalysis["topPositions"][number]["missingSkills"];
}) {
  return (
    <div>
      <h3>
        <AlertTriangle aria-hidden="true" />
        Missing Skills
      </h3>
      {gaps.length ? (
        <ul className="gap-table">
          {gaps.map((gap) => (
            <li key={gap.skill}>
              <span>{gap.skill}</span>
              <small>{gap.importance}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="list-placeholder">No gaps to display yet.</p>
      )}
    </div>
  );
}

function ReadinessSignals({
  result,
}: {
  result?: CandidateAnalysis["topPositions"][number];
}) {
  if (!result) {
    return (
      <div>
        <h3>
          <BookmarkCheck aria-hidden="true" />
          Readiness Signals
        </h3>
        <p className="list-placeholder">
          Upload a resume to compare experience, certifications, and soft
          skills.
        </p>
      </div>
    );
  }

  const details = result.explanationDetails;
  const experience = details?.experience ?? {
    candidateYears: result.structured.yearsExperience,
    minimumYears: result.role.minimumYearsExperience,
    idealYears: result.role.idealYearsExperience,
  };
  const certifications = details?.certifications ?? { matched: 0, total: 0 };
  const softSkills = details?.softSkills ?? { matched: 0, total: 0 };

  return (
    <div>
      <h3>
        <BookmarkCheck aria-hidden="true" />
        Readiness Signals
      </h3>
      <ul className="match-table">
        <li>
          <span>Experience</span>
          <small>
            {experience.candidateYears ?? "Unknown"} yrs vs{" "}
            {experience.minimumYears}-{experience.idealYears}+ target
          </small>
        </li>
        <li>
          <span>Certifications</span>
          <small>
            {certifications.matched}/{certifications.total} matched
          </small>
        </li>
        <li>
          <span>Soft skills</span>
          <small>
            {softSkills.matched}/{softSkills.total} matched
          </small>
        </li>
      </ul>
    </div>
  );
}

function DashboardStatsPanel({
  stats,
}: {
  stats: {
    resumeCount: number;
    averageMatch: number;
    assignedModules: number;
    activeRoleFamilies: number;
    roleDistribution: Array<[string, number]>;
  };
}) {
  const maxRoleCount = Math.max(
    ...stats.roleDistribution.map(([, count]) => count),
    1,
  );

  return (
    <section
      className="dashboard-stats-panel"
      aria-label="Dashboard statistics"
    >
      <div className="dashboard-stat-card">
        <span>Resumes analyzed</span>
        <strong>{stats.resumeCount}</strong>
      </div>
      <div className="dashboard-stat-card">
        <span>Average top match</span>
        <strong>{stats.resumeCount ? `${stats.averageMatch}%` : "—"}</strong>
      </div>
      <div className="dashboard-stat-card">
        <span>Assigned modules</span>
        <strong>{stats.assignedModules}</strong>
      </div>
      <div className="dashboard-stat-card">
        <span>Role families</span>
        <strong>{stats.activeRoleFamilies}</strong>
      </div>
      <div className="role-distribution-card">
        <span>Recommended role mix</span>
        {stats.roleDistribution.length ? (
          <ul>
            {stats.roleDistribution.map(([roleTitle, count]) => (
              <li key={roleTitle}>
                <small>{roleTitle}</small>
                <div aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(8, (count / maxRoleCount) * 100)}%`,
                    }}
                  />
                </div>
                <b>{count}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p>No analyzed resumes yet.</p>
        )}
      </div>
    </section>
  );
}

function DashboardGapPanel({ gaps }: { gaps: Array<[string, number]> }) {
  const maxGapCount = Math.max(...gaps.map(([, count]) => count), 1);

  return (
    <section
      className="dashboard-gap-panel"
      aria-labelledby="dashboard-gap-title"
    >
      <div className="panel-heading">
        <h3 id="dashboard-gap-title">Top Workforce Gaps</h3>
        <span>{gaps.length ? "Across resumes" : "No gap data"}</span>
      </div>
      {gaps.length ? (
        <ul className="dashboard-gap-list">
          {gaps.slice(0, 5).map(([skill, count]) => (
            <li key={skill}>
              <span className="dashboard-gap-skill">{skill}</span>
              <span className="dashboard-gap-meter" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.max(8, (count / maxGapCount) * 100)}%`,
                  }}
                />
              </span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="chart-caption">No analyzed resumes yet.</p>
      )}
    </section>
  );
}

function RoleSkillGapChart({
  candidateName,
  items,
  roleTitle,
}: {
  candidateName?: string;
  items: SkillGapChartItem[];
  roleTitle: string;
}) {
  const chartW = 560;
  const barX = 208;
  const barW = 260;
  const metaX = 548;
  const chartHeight = Math.max(items.length * 42 + 28, 180);

  if (!items.length) {
    return (
      <section
        className="skill-gap-chart-panel skill-gap-chart-panel--empty"
        aria-labelledby="skill-gap-chart-title"
      >
        <div className="panel-heading">
          <h3 id="skill-gap-chart-title">Role Skill-Gap Chart</h3>
        </div>
        <p className="chart-caption">
          Upload a resume and run analysis to see skill coverage for {roleTitle}
          .
        </p>
        <div className="chart-placeholder" />
      </section>
    );
  }

  return (
    <section
      className="skill-gap-chart-panel"
      aria-labelledby="skill-gap-chart-title"
    >
      <div className="panel-heading">
        <h3 id="skill-gap-chart-title">Role Skill-Gap Chart</h3>
        <span>{candidateName ?? "Candidate"}</span>
      </div>
      <p className="chart-caption">
        {`${candidateName ?? "Candidate"}'s coverage for ${roleTitle}. Green bars are matched skills; shorter bars are gaps (required vs preferred).`}
      </p>
      <figure
        className="skill-gap-chart-figure"
        aria-label={`${roleTitle} skill coverage chart`}
      >
        <svg
          aria-labelledby="skill-gap-chart-title"
          className="skill-gap-chart"
          role="img"
          viewBox={`0 0 ${chartW} ${chartHeight}`}
        >
          {items.map((item, index) => {
            const y = 18 + index * 42;
            const fillWidth = Math.max(
              36,
              Math.round((item.coverage / 100) * barW),
            );
            const barClassName = [
              "chart-bar-fill",
              item.status === "matched" ? "is-matched" : "",
              item.source === "required" ? "is-required" : "is-preferred",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <g key={item.skill} transform={`translate(0 ${y})`}>
                <text className="chart-skill-label" x="0" y="14">
                  {item.skill}
                </text>
                <rect
                  className="chart-bar-track"
                  height="14"
                  rx="7"
                  ry="7"
                  width={barW}
                  x={barX}
                  y="0"
                />
                <rect
                  className={barClassName}
                  height="14"
                  rx="7"
                  ry="7"
                  width={fillWidth}
                  x={barX}
                  y="0"
                />
                <text className="chart-meta-label" x={metaX} y="12">
                  {item.status === "matched" ? "Matched" : item.importance}
                </text>
              </g>
            );
          })}
        </svg>
        <figcaption className="chart-legend">
          <span>
            <i className="legend-swatch matched" aria-hidden="true" />
            Matched skill
          </span>
          <span>
            <i className="legend-swatch preferred" aria-hidden="true" />
            Preferred gap
          </span>
          <span>
            <i className="legend-swatch critical" aria-hidden="true" />
            Required gap
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

function TechnologyChipFilter({
  label,
  options,
  placeholder,
  selectedValues,
  onChange,
}: {
  label: string;
  options: string[];
  placeholder: string;
  selectedValues: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const selectedLookup = useMemo(
    () => new Set(selectedValues.map((value) => value.toLowerCase())),
    [selectedValues],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = options
    .filter((option) => !selectedLookup.has(option.toLowerCase()))
    .filter((option) => {
      if (!normalizedQuery) {
        return true;
      }
      return (
        option.toLowerCase().includes(normalizedQuery) ||
        formatTechnologyLabel(option).toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 7);

  function addValue(nextValue: string) {
    const trimmedValue = nextValue.trim();
    if (!trimmedValue) {
      return;
    }
    const matchedOption =
      options.find(
        (option) => option.toLowerCase() === trimmedValue.toLowerCase(),
      ) ??
      options.find(
        (option) =>
          formatTechnologyLabel(option).toLowerCase() ===
          trimmedValue.toLowerCase(),
      );
    const committedValue = matchedOption ?? trimmedValue.toLowerCase();
    if (selectedLookup.has(committedValue.toLowerCase())) {
      setQuery("");
      return;
    }
    onChange([...selectedValues, committedValue]);
    setQuery("");
  }

  function removeValue(value: string) {
    onChange(
      selectedValues.filter(
        (item) => item.toLowerCase() !== value.toLowerCase(),
      ),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addValue(suggestions[0] ?? query);
      return;
    }
    if (event.key === "Backspace" && !query && selectedValues.length) {
      removeValue(selectedValues[selectedValues.length - 1]!);
    }
  }

  return (
    <label className="chip-filter-label">
      {label}
      <div className="chip-filter-control">
        <div className="chip-filter-input-row">
          {selectedValues.map((value) => (
            <span className="filter-chip" key={value}>
              {formatTechnologyLabel(value)}
              <button
                type="button"
                onClick={() => removeValue(value)}
                aria-label={`Remove ${formatTechnologyLabel(value)}`}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            aria-label={`${label} filter`}
            value={query}
            onBlur={() => setFocused(false)}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            placeholder={selectedValues.length ? "Add another" : placeholder}
          />
        </div>
        {focused && normalizedQuery && suggestions.length ? (
          <div
            className="chip-filter-menu"
            role="listbox"
            aria-label={`${label} suggestions`}
          >
            {suggestions.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addValue(option)}
              >
                <span>{formatTechnologyLabel(option)}</span>
                <small>{option}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function SavedTargetRolesPanel({
  currentRoleSaved,
  roles,
  status,
  bookmarkDisabled,
  bookmarkDisabledReason,
  onRemove,
  onSave,
  onSelect,
}: {
  currentRoleSaved: boolean;
  roles: SavedTargetRole[];
  status: LoadStatus;
  bookmarkDisabled?: boolean;
  bookmarkDisabledReason?: string;
  onRemove: (id: string) => void;
  onSave: () => void;
  onSelect: (roleId: string) => void;
}) {
  return (
    <section
      className="concept-panel saved-target-panel"
      aria-labelledby="saved-target-roles-heading"
    >
      <div className="panel-heading">
        <h2 id="saved-target-roles-heading">Saved Target Roles</h2>
        <span>{status === "loading" ? "..." : roles.length}</span>
      </div>
      <p
        id="saved-target-roles-help"
        className="m-0 mb-3 text-[12px] leading-snug text-muted"
      >
        Candidates are persisted when you run analysis (see{" "}
        <strong className="font-semibold text-ink">Analyses</strong>). Bookmark
        the <strong className="font-semibold text-ink">comparison role</strong>{" "}
        on the Dashboard to pin gap tracking and learning picks—optional,
        separate from storing résumés.
      </p>
      <button
        className="primary-action"
        type="button"
        onClick={onSave}
        aria-describedby="saved-target-roles-help"
        disabled={Boolean(bookmarkDisabled)}
        title={bookmarkDisabled ? bookmarkDisabledReason : undefined}
      >
        <BookmarkCheck aria-hidden="true" />
        {currentRoleSaved
          ? "Refresh bookmark & snapshot"
          : "Bookmark role for Learning"}
      </button>
      {status === "loading" ? (
        <p className="list-placeholder" role="status">
          Loading saved target roles...
        </p>
      ) : null}
      {status === "error" ? (
        <p className="error-message" role="alert">
          Could not load saved target roles. Use Refresh to try again.
        </p>
      ) : null}
      {status !== "loading" && roles.length ? (
        <ul className="saved-role-list">
          {roles.slice(0, 3).map((role) => (
            <li key={role.id}>
              <button type="button" onClick={() => onSelect(role.roleId)}>
                <Target aria-hidden="true" />
                <span>
                  <strong>{role.roleTitle}</strong>
                  <small>
                    {role.currentScore === null
                      ? "No score yet"
                      : `${role.currentScore}% current match`}
                  </small>
                </span>
                <em>{role.progressPercent}%</em>
              </button>
              <button
                aria-label={`Remove ${role.roleTitle}`}
                className="queue-icon-button"
                onClick={() => onRemove(role.id)}
                title={`Remove ${role.roleTitle}`}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : status === "ready" && !roles.length ? (
        <p className="list-placeholder">
          Bookmark a role above to unlock Learning progress—not required to
          keep analyzed candidates.
        </p>
      ) : null}
    </section>
  );
}

function SavedRoleProgress({
  roles,
  status,
  onRemove,
  onSelect,
}: {
  roles: SavedTargetRole[];
  status: LoadStatus;
  onRemove: (id: string) => void;
  onSelect: (roleId: string) => void;
}) {
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Target Role Progress</h2>
        <span>
          {status === "loading"
            ? "Loading"
            : roles.length
              ? "Employee plan"
              : "No saved targets"}
        </span>
      </div>
      {status === "loading" ? (
        <p className="list-placeholder" role="status">
          Loading target roles...
        </p>
      ) : null}
      {status === "error" ? (
        <p className="error-message" role="alert">
          Could not load target role progress. Use Refresh to try again.
        </p>
      ) : null}
      {status !== "loading" && roles.length ? (
        <div className="saved-progress-grid">
          {roles.map((role) => (
            <article key={role.id}>
              <div>
                <strong>{role.roleTitle}</strong>
                <span>
                  {role.missingSkills.length
                    ? `${role.missingSkills.slice(0, 3).join(", ")} gaps`
                    : "No tracked gaps"}
                </span>
              </div>
              <meter min={0} max={100} value={role.progressPercent} />
              <em>
                {role.progressPercent}% to {role.targetScore}% goal
              </em>
              <button
                className="icon-text-button"
                type="button"
                onClick={() => onSelect(role.roleId)}
              >
                <Target aria-hidden="true" />
                View learning
              </button>
              <button
                className="queue-icon-button"
                type="button"
                onClick={() => onRemove(role.id)}
                aria-label={`Remove ${role.roleTitle}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : status === "ready" && !roles.length ? (
        <p className="list-placeholder">
          No saved target roles yet. Bookmark a comparison role from the
          dashboard sidebar to track gap progress on Learning. Uploaded
          candidates already appear under Analyses; that action only pins the job
          role for progress.
        </p>
      ) : null}
    </section>
  );
}

function AiInsightPanel({
  insight,
}: {
  insight: CandidateAnalysis["aiInsight"];
}) {
  return (
    <section className="concept-panel ai-insight-panel">
      <div className="panel-heading">
        <h2>
          <Sparkles aria-hidden="true" className="inline-icon" />
          AI resume review
        </h2>
        <span>Advisory</span>
      </div>
      {insight ? (
        <div className="ai-insight-body">
          <p className="ai-insight-summary">{insight.summary}</p>
          <div className="ai-insight-columns">
            <div>
              <h3>Strengths</h3>
              <ul>
                {insight.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Development areas</h3>
              <ul>
                {insight.developmentAreas.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <h3>Role fit</h3>
            <p>{insight.roleFitNotes}</p>
          </div>
          {insight.followUpQuestions.length ? (
            <div>
              <h3>Follow-up questions</h3>
              <ul className="follow-up-list">
                {insight.followUpQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="list-placeholder">
          When optional AI resume review is enabled for your workspace, a
          structured narrative appears after each upload. Skill matching above
          still runs without it.
        </p>
      )}
    </section>
  );
}

function LearningResumeRoster({
  candidates,
  selectedCandidateId,
  onSelect,
}: {
  candidates: CandidateAnalysis[];
  selectedCandidateId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      className="concept-panel learning-roster-panel"
      aria-labelledby="learning-roster-heading"
    >
      <div className="panel-heading">
        <h2 id="learning-roster-heading">Uploaded Resumes</h2>
        <span>{candidates.length}</span>
      </div>
      {candidates.length ? (
        <ul className="learning-roster-list">
          {candidates.map((candidate) => {
            const recommendedRole = candidate.topPositions[0];
            const assignedCount =
              candidate.assignedLearningModules?.length ?? 0;
            return (
              <li key={candidate.id}>
                <button
                  aria-current={
                    candidate.id === selectedCandidateId ? "true" : undefined
                  }
                  className={
                    candidate.id === selectedCandidateId ? "is-selected" : ""
                  }
                  onClick={() => onSelect(candidate.id)}
                  type="button"
                >
                  <FileText aria-hidden="true" />
                  <span>
                    <strong>{candidate.candidateName}</strong>
                    <small>{candidate.fileName}</small>
                    <em>
                      {recommendedRole?.role.title ?? "No recommendation"}
                    </em>
                  </span>
                  <b>{assignedCount}</b>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyPanel
          title="No uploaded resumes"
          text="Upload and analyze resumes from the Dashboard tab. Each resume will appear here with its own recommended training target."
        />
      )}
    </section>
  );
}

function LearningAssignmentPanel({
  busy,
  candidate,
  onRoleChange,
  onToggle,
  role,
  selectedMatch,
}: {
  busy: boolean;
  candidate?: CandidateAnalysis;
  onRoleChange: (roleId: string) => void;
  onToggle: (moduleId: string, assigned: boolean) => void;
  role: RoleRequirement;
  selectedMatch?: CandidateAnalysis["topPositions"][number];
}) {
  const assignedModules = new Set(candidate?.assignedLearningModules ?? []);
  const candidateMissingSkills = new Set(
    candidate?.topPositions
      .find((position) => position.role.id === role.id)
      ?.missingSkills.map((gap) => gap.skill) ??
      candidate?.topPositions[0]?.missingSkills.map((gap) => gap.skill) ??
      [],
  );

  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Recommended Training</h2>
        <span>
          {candidate
            ? `${selectedMatch?.score ?? 0}% role fit`
            : "No resume selected"}
        </span>
      </div>
      {candidate ? (
        <>
          <div className="learning-assignment-summary">
            <div>
              <strong>{candidate.candidateName}</strong>
              <span>
                {candidate.fileName}{" "}
                <CandidateResumeFileLinks candidate={candidate} />
              </span>
            </div>
            <label className="role-context">
              Training target
              <select
                value={role.id}
                onChange={(event) => onRoleChange(event.target.value)}
              >
                {candidate.topPositions.map((recommendation) => (
                  <option
                    key={recommendation.role.id}
                    value={recommendation.role.id}
                  >
                    {recommendation.role.title} ({recommendation.score}%)
                  </option>
                ))}
                {roles
                  .filter(
                    (candidateRole) =>
                      !candidate.topPositions.some(
                        (recommendation) =>
                          recommendation.role.id === candidateRole.id,
                      ),
                  )
                  .map((candidateRole) => (
                    <option key={candidateRole.id} value={candidateRole.id}>
                      {candidateRole.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <p className="m-0 mb-3 text-[12px] leading-snug text-muted">
            SkillMatch recommends the training target from this resume&apos;s
            ranked roles. Recruiters can change the target here when interview
            evidence or manager context points somewhere better.
          </p>
          <div className="learning-grid">
            {Object.entries(role.learning).map(([skill, course]) => {
              const moduleId = learningModuleId(role.id, skill);
              const assigned = assignedModules.has(moduleId);
              const recommended = candidateMissingSkills.has(skill);
              return (
                <article
                  className={`learning-item learning-assignment-item ${assigned ? "is-assigned" : ""}`}
                  key={moduleId}
                >
                  <GraduationCap aria-hidden="true" />
                  <div>
                    <strong>{course}</strong>
                    <span>
                      {skill}
                      {recommended ? " - gap match" : ""}
                    </span>
                  </div>
                  <button
                    className={
                      assigned
                        ? "icon-text-button assigned-module-button"
                        : "icon-text-button"
                    }
                    disabled={busy}
                    onClick={() => onToggle(moduleId, !assigned)}
                    type="button"
                  >
                    {assigned ? "Assigned" : "Assign"}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <p className="list-placeholder">
          Upload and analyze a resume, then assign learning modules from this
          screen.
        </p>
      )}
    </section>
  );
}

function RecommendationPanel({
  candidate,
  compact = false,
}: {
  candidate?: CandidateAnalysis;
  compact?: boolean;
}) {
  const positions = candidate?.topPositions ?? [];
  return (
    <section
      className={compact ? "rail-recommendation-panel" : "concept-panel"}
    >
      <div className="panel-heading">
        <h2>Recommended Positions</h2>
        <span>Prioritized</span>
      </div>
      {positions.length ? (
        <ol className="recommendation-list">
          {positions.slice(0, compact ? 3 : 5).map((recommendation) => (
            <li key={recommendation.role.id}>
              <b>{recommendation.rank}</b>
              <div>
                <strong>{recommendation.role.title}</strong>
                <span>{recommendation.role.department}</span>
              </div>
              <em>{recommendation.score}%</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="list-placeholder">
          Run an analysis to see ranked role recommendations here.
        </p>
      )}
    </section>
  );
}

function RecentCandidates({
  candidates,
  onSelect,
}: {
  candidates: CandidateAnalysis[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Previous Resumes</h2>
        <span>{candidates.length}</span>
      </div>
      {candidates.length ? (
        <ul className="recent-list">
          {candidates.slice(0, 8).map((candidate) => (
            <li key={candidate.id} className="recent-list-item">
              <button type="button" onClick={() => onSelect(candidate.id)}>
                <FileText aria-hidden="true" />
                <span>
                  <strong>{candidate.candidateName}</strong>
                  {candidate.topPositions[0]?.role.title}
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
              <CandidateResumeFileLinks candidate={candidate} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="list-placeholder">
          No uploaded resumes yet. Completed analyses will stay visible here
          while you review dashboard details.
        </p>
      )}
    </section>
  );
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return (
    <article className="concept-panel empty-panel">
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function LoadingPanel({ title, text }: { title: string; text: string }) {
  return (
    <article
      className="concept-panel empty-panel loading-panel"
      role="status"
      aria-live="polite"
    >
      <RefreshCw aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function ErrorPanel({
  title,
  text,
  onRetry,
}: {
  title: string;
  text: string;
  onRetry: () => void;
}) {
  return (
    <article className="concept-panel empty-panel error-panel" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="icon-text-button" type="button" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </button>
    </article>
  );
}

function RestrictedView({ user, view }: { user: SessionUser; view: View }) {
  const copy = getRestrictedViewCopy(view);
  return (
    <section className="screen-stack">
      <article className="concept-panel restricted-panel">
        <LockKeyhole aria-hidden="true" />
        <div>
          <h2>Restricted access: {copy.title}</h2>
          <p>{copy.text}</p>
          <span>Current role: {user.role.replace("_", " ")}</span>
        </div>
      </article>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="concept-panel metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HistoryTable({
  analyses,
  isRefreshing,
  onRetry,
  status,
}: {
  analyses: AnalysisRecord[];
  isRefreshing: boolean;
  onRetry: () => void;
  status: LoadStatus;
}) {
  return (
    <section className="concept-panel audit-log-panel">
      <div className="panel-heading">
        <h2>Analysis History</h2>
        <span>
          {status === "forbidden"
            ? "—"
            : status === "loading"
              ? "…"
              : analyses.length}
        </span>
      </div>
      {status === "loading" ? (
        <p className="m-0 text-[13px] text-muted">Loading analysis history…</p>
      ) : null}
      {status === "forbidden" ? (
        <div className="rounded-lg border border-border-strong bg-brand-light px-3 py-3 text-[13px] leading-relaxed text-ink">
          <strong className="font-semibold">
            Analysis history is limited by role
          </strong>
          <p className="m-0 mt-2 text-muted">
            Standard employee accounts do not see organization-wide analysis
            history. Recruiter, hiring manager, learning and development, and
            system admin roles do. Your SkillMatch overview and candidate cards
            above still reflect résumés processed in this session.
          </p>
        </div>
      ) : null}
      {status === "error" ? (
        <div
          className="error-message m-0 flex flex-wrap items-center justify-between gap-2 text-[13px]"
          role="alert"
        >
          <span>Could not load analysis history. Try again in a moment.</span>
          <button
            className="icon-text-button"
            type="button"
            disabled={isRefreshing}
            onClick={onRetry}
          >
            <RefreshCw aria-hidden="true" />
            {isRefreshing ? "Refreshing..." : "Retry history"}
          </button>
        </div>
      ) : null}
      {status === "ready" || (status === "error" && analyses.length > 0) ? (
        <div className="audit-log-table">
          <div className="audit-log-row head">
            <span>Candidate</span>
            <span>Target Role</span>
            <span>Score</span>
            <span>Created</span>
          </div>
          {analyses.map((analysis) => (
            <div className="audit-log-row" key={analysis.id}>
              <span>{analysis.employeeName}</span>
              <span>{analysis.targetRole}</span>
              <span className="status-chip">{analysis.score}%</span>
              <span>{new Date(analysis.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      ) : null}
      {status === "ready" && analyses.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">
          No history rows yet—history is appended when uploads save successfully
          after analysis.
        </p>
      ) : null}
    </section>
  );
}

function AuditTable({
  events,
  isRefreshing,
  onRetry,
  status,
}: {
  events: AuditEvent[];
  isRefreshing: boolean;
  onRetry: () => void;
  status: LoadStatus;
}) {
  if (status === "loading") {
    return (
      <LoadingPanel
        title="Loading audit events"
        text="Refreshing the latest admin audit trail."
      />
    );
  }

  if (status === "forbidden") {
    return (
      <EmptyPanel
        title="Audit log restricted"
        text="System administrator access is required for login, upload, recommendation, and override events."
      />
    );
  }

  if (status === "error" && events.length === 0) {
    return (
      <ErrorPanel
        title="Could not load audit log"
        text="The audit log did not refresh. Try again in a moment."
        onRetry={onRetry}
      />
    );
  }

  if (status === "ready" && events.length === 0) {
    return (
      <EmptyPanel
        title="No audit events yet"
        text="Login, uploads, recommendations, and recruiter overrides appear here after activity."
      />
    );
  }

  return (
    <>
      {status === "error" ? (
        <div
          className="error-message m-0 mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px]"
          role="alert"
        >
          <span>
            Could not refresh the audit log. Showing the last loaded events.
          </span>
          <button
            className="icon-text-button"
            type="button"
            disabled={isRefreshing}
            onClick={onRetry}
          >
            <RefreshCw aria-hidden="true" />
            {isRefreshing ? "Refreshing..." : "Retry audit log"}
          </button>
        </div>
      ) : null}
      <div className="audit-log-table" aria-busy={isRefreshing}>
        <div className="audit-log-row head">
          <span>Date & Time</span>
          <span>Action</span>
          <span>Actor</span>
          <span>Status</span>
        </div>
        {events.map((event) => (
          <div className="audit-log-row" key={event.id}>
            <span>{new Date(event.createdAt).toLocaleString()}</span>
            <span>{event.action.replaceAll("_", " ")}</span>
            <span>{event.actor}</span>
            <span className="status-chip">Recorded</span>
          </div>
        ))}
      </div>
    </>
  );
}
