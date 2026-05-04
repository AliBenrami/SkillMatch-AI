"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  Search,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Users,
  X,
  type LucideIcon
} from "lucide-react";
import { roles } from "@/lib/seed-data";
import type { SessionUser } from "@/lib/auth-model";
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

type View = "dashboard" | "analyses" | "learning" | "workforce" | "audit" | "settings";

const navItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "analyses", label: "Analyses", icon: BarChart3 },
  { id: "learning", label: "Learning", icon: BookOpen },
  { id: "workforce", label: "Workforce", icon: Users },
  { id: "audit", label: "Audit Log", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings }
];

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export default function Dashboard({ user }: { user: SessionUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [roleId, setRoleId] = useState("sde-ii");
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<CandidateAnalysis[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [savedRoles, setSavedRoles] = useState<SavedTargetRole[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [failures, setFailures] = useState<UploadResponse["failures"]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [educationFilter, setEducationFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [minYearsFilter, setMinYearsFilter] = useState("");

  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0];
  const selectedRoleMatch = selectedCandidate?.topPositions.find((item) => item.role.id === roleId);
  const bestRecommendation = selectedRoleMatch ?? selectedCandidate?.topPositions[0];
  const selectedResult = selectedRoleMatch ?? bestRecommendation;
  const savedCurrentRole = savedRoles.find((role) => role.roleId === roleId);

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

  const workforceGapMeterMax = Math.max(files.length, candidates.length, 5);

  const skillGapChartItems = useMemo<SkillGapChartItem[]>(() => {
    if (!selectedResult) {
      return [];
    }

    const matchedSkills = new Set(selectedResult.matchedSkills);
    const missingSkills = new Map(selectedResult.missingSkills.map((gap) => [gap.skill, gap]));

    return [...selectedRole.requiredSkills, ...selectedRole.preferredSkills].map((skill) => {
      const source: SkillGapChartItem["source"] = selectedRole.requiredSkills.includes(skill) ? "required" : "preferred";
      const isMatched = matchedSkills.has(skill);
      const missingGap = missingSkills.get(skill);

      return {
        skill,
        source,
        status: isMatched ? "matched" : "gap",
        importance: missingGap?.importance ?? (source === "required" ? "critical" : "important"),
        coverage: isMatched ? 100 : source === "required" ? 32 : 56
      };
    });
  }, [selectedRole, selectedResult]);

  const filteredCandidates = candidates.filter((candidate) =>
    `${candidate.candidateName} ${candidate.fileName} ${candidate.topPositions[0]?.role.title ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const refreshRecords = useCallback(async () => {
    const candidateParams = new URLSearchParams();
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

    const candidateQuery = candidateParams.size ? `?${candidateParams.toString()}` : "";
    const auditRequest = user.role === "system_admin" ? fetch("/api/audit") : Promise.resolve(null);
    const [candidateResponse, analysisResponse, savedRolesResponse, auditResponse] = await Promise.all([
      fetch(`/api/candidates${candidateQuery}`),
      fetch("/api/analyses"),
      fetch("/api/saved-roles"),
      auditRequest
    ]);

    if (candidateResponse.ok) {
      const payload = (await candidateResponse.json()) as { candidates: CandidateAnalysis[] };
      setCandidates(payload.candidates);
      setSelectedCandidateId((current) => current || payload.candidates[0]?.id || "");
    }

    if (analysisResponse.ok) {
      const payload = (await analysisResponse.json()) as { analyses: AnalysisRecord[] };
      setAnalyses(payload.analyses);
    }

    if (savedRolesResponse.ok) {
      const payload = (await savedRolesResponse.json()) as { savedRoles: SavedTargetRole[] };
      setSavedRoles(payload.savedRoles);
    }

    if (auditResponse?.ok) {
      const payload = (await auditResponse.json()) as { events: AuditEvent[] };
      setAuditEvents(payload.events);
    }
  }, [educationFilter, locationFilter, minYearsFilter, skillFilter, user.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshRecords]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }
    const nextFiles = Array.from(fileList).filter((file) => /\.(pdf|docx|txt)$/i.test(file.name));
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
  }

  function removeFile(fileToRemove: File) {
    const removeKey = fileKey(fileToRemove);
    setFiles((current) => current.filter((file) => fileKey(file) !== removeKey));
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
          setNotice(`Upload failed (${response.status}). The server returned invalid JSON.`);
          return;
        }
      } else {
        const text = await response.text();
        const snippet = text.trim().slice(0, 200);
        setNotice(
          snippet
            ? `Upload failed (${response.status}). ${snippet}`
            : `Upload failed (${response.status}).`,
        );
        return;
      }

      if (!response.ok) {
        const errBody = payload as { error?: string };
        setNotice(errBody.error ?? `Upload failed (${response.status}).`);
        return;
      }

      const uploadPayload = payload as UploadResponse;
      setCandidates((current) => [...uploadPayload.candidates, ...current]);
      setSelectedCandidateId(uploadPayload.candidates[0]?.id ?? selectedCandidateId);
      setFailures(uploadPayload.failures);

      const duplicates = uploadPayload.duplicates ?? [];
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
      setNotice(message);

      setFiles([]);

      if (!persistWarn) {
        void refreshRecords();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed unexpectedly.");
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
        missingSkills: missingSkills.map((gap) => gap.skill)
      })
    });

    if (!response.ok) {
      setNotice("Could not save this target role.");
      return;
    }

    const payload = (await response.json()) as { savedRole: SavedTargetRole };
    setSavedRoles((current) => [payload.savedRole, ...current.filter((role) => role.id !== payload.savedRole.id)]);
    setNotice(`${selectedRole.title} saved as a target role.`);
  }

  async function removeSavedRole(id: string) {
    const response = await fetch(`/api/saved-roles?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      setSavedRoles((current) => current.filter((role) => role.id !== id));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const matchedSkills = selectedResult?.matchedSkills ?? [];
  const missingSkills = selectedResult?.missingSkills ?? [];

  return (
    <main className="product-shell">
      <div className="product-layout">
        <header className="app-header">
          <div className="brand-block">
            <div className="brand-title">
              <h1>SkillMatch AI</h1>
              <p className="brand-tagline">Resume analysis and role fit</p>
            </div>
            <label className="role-context">
              Target role
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="header-actions">
            <span className="session-meta">
              {user.name}
              <span className="session-meta-role">{user.role.replace("_", " ")}</span>
            </span>
            <button className="icon-text-button" type="button" onClick={logout}>
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

        <nav className="top-nav" aria-label="Sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`top-nav-item ${view === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
              >
                <Icon aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <section className="main-product">

        {view === "dashboard" ? (
          <>
            <section className="concept-grid">
              <section className="concept-panel upload-panel">
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
                  <strong>Drop PDF, DOCX, or TXT resumes here</strong>
                  <span>or click to browse</span>
                  <input
                    aria-label="Upload resume files"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(event) => {
                      addFiles(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
                <div className="queue-header">
                  <span>{files.length ? `${files.length} selected` : "No resumes selected"}</span>
                  <button className="queue-clear-button" type="button" onClick={clearFiles} disabled={!files.length || isUploading}>
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
                  <h3>Role context</h3>
                  <p>Job Family: {selectedRole.family}</p>
                  <p>Business Unit: {selectedRole.department}</p>
                  <p>Level: {selectedRole.level}</p>
                  <p>
                    Experience: {selectedRole.minimumYearsExperience} to {selectedRole.idealYearsExperience}+ years
                  </p>
                  <p>
                    Certifications:{" "}
                    {selectedRole.requiredCertifications.concat(selectedRole.preferredCertifications).join(", ") || "None specified"}
                  </p>
                  <p>
                    Soft skills:{" "}
                    {selectedRole.requiredSoftSkills.concat(selectedRole.preferredSoftSkills).join(", ")}
                  </p>
                </div>
                {notice ? <p className="notice">{notice}</p> : null}
                {failures.map((failure) => (
                  <p className="error-message" key={failure.fileName}>
                    {failure.fileName}: {failure.error}
                  </p>
                ))}
                <button className="run-button" onClick={uploadResumes} disabled={isUploading || !files.length}>
                  <SlidersHorizontal aria-hidden="true" />
                  {isUploading ? "Processing resumes..." : "Run SkillMatch Analysis"}
                </button>
              </section>

              <section className="concept-panel overview-panel">
                <div className="panel-heading">
                  <h2>Skill Match Overview</h2>
                  {selectedCandidate ? <span>{selectedCandidate.candidateName}</span> : null}
                </div>
                <div className="overview-content">
                  <div className="overview-summary">
                    <div className={`score-column${selectedResult ? "" : " is-empty"}`}>
                      <div
                        className="score-ring large"
                        style={{ "--score": `${selectedResult?.score ?? 0}%` } as CSSProperties}
                        aria-label={selectedResult ? `Match score ${selectedResult.score}%` : "No match score yet"}
                      >
                        <strong>{selectedResult ? `${selectedResult.score}%` : "—"}</strong>
                      </div>
                      <strong>Overall Match</strong>
                      <span>{selectedResult ? selectedRole.title : "Upload resumes to rank positions"}</span>
                    </div>
                    <SkillList title="Top Matched Skills" items={matchedSkills.slice(0, 8)} />
                    <ReadinessSignals result={selectedResult} />
                    <GapList gaps={missingSkills.slice(0, 8)} />
                  </div>
                  <RoleSkillGapChart
                    candidateName={selectedCandidate?.candidateName}
                    items={skillGapChartItems}
                    roleTitle={selectedRole.title}
                  />
                </div>
              </section>

              <aside className="right-stack">
                <SavedTargetRolesPanel
                  currentRoleSaved={Boolean(savedCurrentRole)}
                  roles={savedRoles}
                  onRemove={removeSavedRole}
                  onSave={saveCurrentTargetRole}
                  onSelect={(id) => {
                    setRoleId(id);
                    setView("learning");
                  }}
                />
                <RecommendationPanel candidate={selectedCandidate} />
                <AiInsightPanel insight={selectedCandidate?.aiInsight ?? null} />
                <RecentCandidates candidates={candidates} onSelect={setSelectedCandidateId} />
              </aside>
            </section>
          </>
        ) : null}

        {view === "analyses" ? (
          <section className="screen-stack">
            <div className="screen-toolbar">
              <label className="search-box">
                <Search aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidates" />
              </label>
              <button className="icon-text-button" onClick={() => void refreshRecords()}>Refresh</button>
            </div>
            <div className="filter-toolbar" aria-label="Candidate filters">
              <label>
                Skills
                <input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} placeholder="java, aws" />
              </label>
              <label>
                Education
                <input value={educationFilter} onChange={(event) => setEducationFilter(event.target.value)} placeholder="Bachelor" />
              </label>
              <label>
                Location
                <input value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} placeholder="Seattle" />
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
              {filteredCandidates.map((candidate) => (
                <article className="candidate-card" key={candidate.id}>
                  <div className="panel-heading">
                    <h2>{candidate.candidateName}</h2>
                    <em className="status-chip">{candidate.topPositions[0]?.score ?? 0}%</em>
                  </div>
                  <p>
                    {candidate.fileName}{" "}
                    <a className="resume-download-link" href={`/api/candidates/${candidate.id}/resume`}>
                      Download original
                    </a>
                  </p>
                  <strong style={{ fontSize: "13px" }}>{candidate.topPositions[0]?.role.title ?? "No recommendation"}</strong>
                  <span className="candidate-meta">
                    {(candidate.structured.skills.slice(0, 4).join(", ") || "No skills extracted")}
                    {candidate.structured.location ? ` | ${candidate.structured.location}` : ""}
                    {candidate.structured.yearsExperience !== null ? ` | ${candidate.structured.yearsExperience} yrs` : ""}
                  </span>
                  <small>{candidate.topPositions[0]?.explanation}</small>
                </article>
              ))}
              {!filteredCandidates.length ? <EmptyPanel title="No candidate analyses yet" text="Upload resumes from the dashboard to populate this screen." /> : null}
            </section>
            <HistoryTable analyses={analyses} />
          </section>
        ) : null}

        {view === "learning" ? (
          <section className="screen-stack">
            <section className="metric-grid">
              <Metric label="Saved target roles" value={savedRoles.length} />
              <Metric label="Current role progress" value={savedCurrentRole ? `${savedCurrentRole.progressPercent}%` : "Not saved"} />
              <Metric label="Target match score" value={savedCurrentRole ? `${savedCurrentRole.targetScore}%` : "80%"} />
            </section>
            <section className="concept-panel">
              <div className="panel-heading">
                <h2>Learning Recommendations</h2>
                <span>{selectedRole.title}</span>
              </div>
              <div className="learning-grid">
                {Object.entries(selectedRole.learning).map(([skill, course]) => (
                  <article className="learning-item" key={skill}>
                    <GraduationCap aria-hidden="true" />
                    <div>
                      <strong>{course}</strong>
                      <span>{skill}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <SavedRoleProgress roles={savedRoles} onRemove={removeSavedRole} onSelect={setRoleId} />
          </section>
        ) : null}

        {view === "workforce" ? (
          <section className="screen-stack">
            <section className="metric-grid">
              <Metric label="Open role families" value={roles.length} />
              <Metric label="Candidates reviewed" value={candidates.length} />
              <Metric label="Tracked skill gaps" value={workforceGaps.length || selectedRole.requiredSkills.length} />
            </section>
            <section className="concept-panel">
              <div className="panel-heading">
                <h2>Role Coverage Matrix</h2>
                <span>Current catalog</span>
              </div>
              <div className="role-matrix">
                {roles.map((role) => (
                  <article key={role.id}>
                    <strong>{role.title}</strong>
                    <span>{role.department}</span>
                    <small>{role.requiredSkills.slice(0, 5).join(", ")}</small>
                  </article>
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-4 shadow-md md:p-[clamp(1rem,1.15vw,1.125rem)]">
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-border pb-3">
                <h2 className="m-0 text-[15px] font-bold tracking-tight text-[#0f172a]">Common skill gaps</h2>
                <span className="max-w-xs text-end text-xs font-semibold leading-snug text-muted sm:max-w-sm">
                  {selectedRole.title}
                </span>
              </div>
              <p className="m-0 text-[13px] leading-relaxed text-muted">
                Aggregated missing skills from recent analyses (when available).
              </p>
              <div className="flex flex-col gap-3">
                {(workforceGaps.length
                  ? workforceGaps
                  : selectedRole.requiredSkills
                      .slice(0, 5)
                      .map((skill, index) => [skill, 5 - index] as [string, number])
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
                  <span className="text-[12px] font-bold uppercase tracking-wide text-subtle">Processing queue</span>
                  <p className="m-0 text-[13px] font-medium leading-snug text-ink">
                    {isUploading && files.length > 0 ? (
                      <>
                        <span className="font-semibold text-brand">{files.length}</span> resume upload
                        {files.length === 1 ? "" : "s"} in progress.
                      </>
                    ) : (
                      <span className="text-muted">Idle — nothing queued right now.</span>
                    )}
                  </p>
                </div>
              </div>
            </section>
          </section>
        ) : null}

        {view === "audit" ? (
          <section className="screen-stack">
            <section className="concept-panel audit-log-panel">
              <div className="panel-heading">
                <h2>Audit Log</h2>
                <span>{user.role === "system_admin" ? `${auditEvents.length} events` : "Admin only"}</span>
              </div>
              {user.role === "system_admin" ? <AuditTable events={auditEvents} /> : <EmptyPanel title="Restricted screen" text="System administrators can view login, upload, and override events." />}
            </section>
          </section>
        ) : null}

        {view === "settings" ? (
          <section className="screen-stack">
            <section className="concept-panel settings-grid">
              <div>
                <h2>Account</h2>
                <p>{user.name}</p>
                <strong>{user.email}</strong>
                <span>{user.role.replace("_", " ")}</span>
              </div>
              <div>
                <h2>MVP Controls</h2>
                <p>Credential users are loaded from AUTH_USERS_JSON.</p>
                <p>Session lifetime is eight hours.</p>
                <p>Database storage activates when DATABASE_URL is present.</p>
              </div>
            </section>
          </section>
        ) : null}
        </section>
      </div>
    </main>
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
              <small>Strong</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="list-placeholder">Upload a resume to see matched skills.</p>
      )}
    </div>
  );
}

function GapList({ gaps }: { gaps: CandidateAnalysis["topPositions"][number]["missingSkills"] }) {
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

function ReadinessSignals({ result }: { result?: CandidateAnalysis["topPositions"][number] }) {
  if (!result) {
    return (
      <div>
        <h3>
          <BookmarkCheck aria-hidden="true" />
          Readiness Signals
        </h3>
        <p className="list-placeholder">Upload a resume to compare experience, certifications, and soft skills.</p>
      </div>
    );
  }

  const { certifications, experience, softSkills } = result.explanationDetails;

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
            {experience.candidateYears ?? "Unknown"} yrs vs {experience.minimumYears}-{experience.idealYears}+ target
          </small>
        </li>
        <li>
          <span>Certifications</span>
          <small>{certifications.matched}/{certifications.total} matched</small>
        </li>
        <li>
          <span>Soft skills</span>
          <small>{softSkills.matched}/{softSkills.total} matched</small>
        </li>
      </ul>
    </div>
  );
}

function RoleSkillGapChart({
  candidateName,
  items,
  roleTitle
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
          Upload a resume and run analysis to see skill coverage for {roleTitle}.
        </p>
        <div className="chart-placeholder" />
      </section>
    );
  }

  return (
    <section className="skill-gap-chart-panel" aria-labelledby="skill-gap-chart-title">
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
            const fillWidth = Math.max(36, Math.round((item.coverage / 100) * barW));
            const barClassName = [
              "chart-bar-fill",
              item.status === "matched" ? "is-matched" : "",
              item.source === "required" ? "is-required" : "is-preferred"
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <g key={item.skill} transform={`translate(0 ${y})`}>
                <text className="chart-skill-label" x="0" y="14">
                  {item.skill}
                </text>
                <rect className="chart-bar-track" height="14" rx="7" ry="7" width={barW} x={barX} y="0" />
                <rect className={barClassName} height="14" rx="7" ry="7" width={fillWidth} x={barX} y="0" />
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

function SavedTargetRolesPanel({
  currentRoleSaved,
  roles,
  onRemove,
  onSave,
  onSelect
}: {
  currentRoleSaved: boolean;
  roles: SavedTargetRole[];
  onRemove: (id: string) => void;
  onSave: () => void;
  onSelect: (roleId: string) => void;
}) {
  return (
    <section className="concept-panel saved-target-panel">
      <div className="panel-heading">
        <h2>Saved Target Roles</h2>
        <span>{roles.length}</span>
      </div>
      <button className="primary-action" type="button" onClick={onSave}>
        <BookmarkCheck aria-hidden="true" />
        {currentRoleSaved ? "Update target progress" : "Save current target"}
      </button>
      {roles.length ? (
        <ul className="saved-role-list">
          {roles.slice(0, 3).map((role) => (
            <li key={role.id}>
              <button type="button" onClick={() => onSelect(role.roleId)}>
                <Target aria-hidden="true" />
                <span>
                  <strong>{role.roleTitle}</strong>
                  <small>{role.currentScore === null ? "No score yet" : `${role.currentScore}% current match`}</small>
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
      ) : (
        <p className="list-placeholder">Save target roles to track skill progress over time.</p>
      )}
    </section>
  );
}

function SavedRoleProgress({
  roles,
  onRemove,
  onSelect
}: {
  roles: SavedTargetRole[];
  onRemove: (id: string) => void;
  onSelect: (roleId: string) => void;
}) {
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Target Role Progress</h2>
        <span>{roles.length ? "Employee plan" : "No saved targets"}</span>
      </div>
      {roles.length ? (
        <div className="saved-progress-grid">
          {roles.map((role) => (
            <article key={role.id}>
              <div>
                <strong>{role.roleTitle}</strong>
                <span>{role.missingSkills.length ? `${role.missingSkills.slice(0, 3).join(", ")} gaps` : "No tracked gaps"}</span>
              </div>
              <meter min={0} max={100} value={role.progressPercent} />
              <em>{role.progressPercent}% to {role.targetScore}% goal</em>
              <button className="icon-text-button" type="button" onClick={() => onSelect(role.roleId)}>
                <Target aria-hidden="true" />
                View learning
              </button>
              <button className="queue-icon-button" type="button" onClick={() => onRemove(role.id)} aria-label={`Remove ${role.roleTitle}`}>
                <Trash2 aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel title="No saved target roles" text="Save a role from the dashboard to start tracking employee progress." />
      )}
    </section>
  );
}

function AiInsightPanel({ insight }: { insight: CandidateAnalysis["aiInsight"] }) {
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
          Configure <code>GEMINI_API_KEY</code> (Google AI Studio) on the server to generate a structured narrative after
          each upload. Skill matching above still runs without it.
        </p>
      )}
    </section>
  );
}

function RecommendationPanel({ candidate }: { candidate?: CandidateAnalysis }) {
  const positions = candidate?.topPositions ?? [];
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Recommended Positions</h2>
        <span>Prioritized</span>
      </div>
      {positions.length ? (
        <ol className="recommendation-list">
          {positions.slice(0, 5).map((recommendation) => (
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

function RecentCandidates({ candidates, onSelect }: { candidates: CandidateAnalysis[]; onSelect: (id: string) => void }) {
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Recent Analyses</h2>
        <span>{candidates.length}</span>
      </div>
      {candidates.length ? (
        <ul className="recent-list">
          {candidates.slice(0, 4).map((candidate) => (
            <li key={candidate.id}>
              <button onClick={() => onSelect(candidate.id)}>
                <FileText aria-hidden="true" />
                <span>
                  <strong>{candidate.candidateName}</strong>
                  {candidate.topPositions[0]?.role.title}
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="list-placeholder">No analyses yet.</p>
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="concept-panel metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HistoryTable({ analyses }: { analyses: AnalysisRecord[] }) {
  return (
    <section className="concept-panel audit-log-panel">
      <div className="panel-heading">
        <h2>Analysis History</h2>
        <span>{analyses.length}</span>
      </div>
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
    </section>
  );
}

function AuditTable({ events }: { events: AuditEvent[] }) {
  return (
    <div className="audit-log-table">
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
  );
}
