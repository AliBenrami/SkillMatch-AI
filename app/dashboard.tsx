"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  Users,
  X,
  type LucideIcon
} from "lucide-react";
import { AppHeader, NavigationRail } from "./components/amazon-brand";
import { roles } from "@/lib/seed-data";
import type { SessionUser } from "@/lib/auth-model";
import type { AnalysisRecord, AuditEvent } from "@/lib/db";
import type { CandidateAnalysis } from "@/lib/skillmatch";

type UploadResponse = {
  candidates: CandidateAnalysis[];
  failures: Array<{ fileName: string; error: string }>;
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
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [failures, setFailures] = useState<UploadResponse["failures"]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0];
  const selectedRoleMatch = selectedCandidate?.topPositions.find((item) => item.role.id === roleId);
  const bestRecommendation = selectedRoleMatch ?? selectedCandidate?.topPositions[0];
  const selectedResult = selectedRoleMatch ?? bestRecommendation;

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

  const skillGapChartItems = useMemo<SkillGapChartItem[]>(() => {
    const matchedSkills = new Set(selectedResult?.matchedSkills ?? []);
    const missingSkills = new Map((selectedResult?.missingSkills ?? []).map((gap) => [gap.skill, gap]));

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
    const auditRequest = user.role === "system_admin" ? fetch("/api/audit") : Promise.resolve(null);
    const [candidateResponse, analysisResponse, auditResponse] = await Promise.all([
      fetch("/api/candidates"),
      fetch("/api/analyses"),
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

    if (auditResponse?.ok) {
      const payload = (await auditResponse.json()) as { events: AuditEvent[] };
      setAuditEvents(payload.events);
    }
  }, [user.role]);

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

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json()) as UploadResponse | { error: string };

    if (!response.ok) {
      setNotice("error" in payload ? payload.error : "Upload failed.");
      setIsUploading(false);
      return;
    }

    const uploadPayload = payload as UploadResponse;
    setCandidates((current) => [...uploadPayload.candidates, ...current]);
    setSelectedCandidateId(uploadPayload.candidates[0]?.id ?? selectedCandidateId);
    setFailures(uploadPayload.failures);
    setFiles([]);
    setNotice(
      uploadPayload.candidates.length
        ? `Processed ${uploadPayload.candidates.length} resume${uploadPayload.candidates.length === 1 ? "" : "s"}.`
        : "No resumes were processed."
    );
    setIsUploading(false);
    void refreshRecords();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const matchedSkills = selectedResult?.matchedSkills ?? [];
  const missingSkills = selectedResult?.missingSkills ?? [];

  return (
    <main className="product-shell">
      <NavigationRail currentView={view} items={navItems} onSelect={setView} />

      <section className="main-product">
        <AppHeader user={user} onLogout={logout}>
          <label className="role-context">
            Role Context
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </label>
        </AppHeader>

        {view === "dashboard" ? (
          <>
            <section className="concept-grid">
              <section className="concept-panel upload-panel">
                <h2>1. Upload Resumes</h2>
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
                  <h3>2. Target Internal Role</h3>
                  <p>Job Family: {selectedRole.family}</p>
                  <p>Business Unit: {selectedRole.department}</p>
                  <p>Level: {selectedRole.level}</p>
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
                  <div className="score-column">
                    <div className="score-ring large" style={{ "--score": `${selectedResult?.score ?? 0}%` } as CSSProperties}>
                      <strong>{selectedResult?.score ?? 0}%</strong>
                    </div>
                    <strong>Overall Match</strong>
                    <span>{selectedResult ? selectedRole.title : "Upload resumes to rank positions"}</span>
                  </div>
                  <div className="role-detail-stack">
                    <div className="skill-columns">
                      <SkillList title="Top Matched Skills" items={matchedSkills.slice(0, 8)} />
                      <GapList gaps={missingSkills.slice(0, 8)} />
                    </div>
                    <RoleSkillGapChart
                      candidateName={selectedCandidate?.candidateName}
                      items={skillGapChartItems}
                      roleTitle={selectedRole.title}
                    />
                  </div>
                </div>
              </section>

              <aside className="right-stack">
                <RecommendationPanel candidate={selectedCandidate} />
                <RecentCandidates candidates={candidates} onSelect={setSelectedCandidateId} />
              </aside>
            </section>
            <BottomPanels user={user} selectedRole={selectedRole} workforceGaps={workforceGaps} isUploading={isUploading} files={files} />
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
            <section className="data-grid">
              {filteredCandidates.map((candidate) => (
                <article className="candidate-card" key={candidate.id}>
                  <div className="panel-heading">
                    <h2>{candidate.candidateName}</h2>
                    <span>{candidate.topPositions[0]?.score ?? 0}%</span>
                  </div>
                  <p>{candidate.fileName}</p>
                  <strong>{candidate.topPositions[0]?.role.title ?? "No recommendation"}</strong>
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
            <BottomPanels user={user} selectedRole={selectedRole} workforceGaps={workforceGaps} isUploading={isUploading} files={files} />
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
      <ul className="match-table">
        {items.map((skill) => (
          <li key={skill}>
            <span>{skill}</span>
            <small>Strong</small>
          </li>
        ))}
      </ul>
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
      <ul className="gap-table">
        {gaps.map((gap) => (
          <li key={gap.skill}>
            <span>{gap.skill}</span>
            <small>{gap.importance}</small>
          </li>
        ))}
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
  const chartHeight = Math.max(items.length * 42 + 28, 180);

  if (!items.length) {
    return null;
  }

  return (
    <section className="skill-gap-chart-panel" aria-labelledby="skill-gap-chart-title">
      <div className="panel-heading">
        <h3 id="skill-gap-chart-title">Role Skill-Gap Chart</h3>
        <span>{candidateName ?? "Awaiting resume"}</span>
      </div>
      <p className="chart-caption">
        {candidateName
          ? `${candidateName}'s coverage for ${roleTitle}. Required skill gaps show lower coverage than preferred gaps.`
          : `Select a candidate to compare skills against ${roleTitle}.`}
      </p>
      <figure className="skill-gap-chart-figure">
        <svg
          aria-labelledby="skill-gap-chart-title"
          className="skill-gap-chart"
          role="img"
          viewBox={`0 0 420 ${chartHeight}`}
        >
          {items.map((item, index) => {
            const y = 18 + index * 42;
            const fillWidth = Math.max(26, Math.round((item.coverage / 100) * 190));
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
                <rect className="chart-bar-track" height="14" rx="7" ry="7" width="190" x="176" y="0" />
                <rect className={barClassName} height="14" rx="7" ry="7" width={fillWidth} x="176" y="0" />
                <text className="chart-meta-label" x="378" y="12">
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
      <ul className="chart-detail-list" aria-label={`${roleTitle} skill coverage details`}>
        {items.map((item) => (
          <li key={item.skill}>
            <span>{item.skill}</span>
            <small>{item.source === "required" ? "Required" : "Preferred"}</small>
            <strong>{item.status === "matched" ? "Matched" : item.importance}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecommendationPanel({ candidate }: { candidate?: CandidateAnalysis }) {
  return (
    <section className="concept-panel">
      <div className="panel-heading">
        <h2>Recommended Positions</h2>
        <span>Prioritized</span>
      </div>
      <ol className="recommendation-list">
        {(candidate?.topPositions ?? []).slice(0, 5).map((recommendation) => (
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
    </section>
  );
}

function BottomPanels({
  user,
  selectedRole,
  workforceGaps,
  isUploading,
  files
}: {
  user: SessionUser;
  selectedRole: (typeof roles)[number];
  workforceGaps: Array<[string, number]>;
  isUploading: boolean;
  files: File[];
}) {
  return (
    <section className="bottom-grid">
      <section className="concept-panel audit-log-panel">
        <h2>Recruiter / Admin Audit Snapshot</h2>
        <div className="audit-log-table">
          <div className="audit-log-row head">
            <span>Date & Time</span>
            <span>Action</span>
            <span>User</span>
            <span>Status</span>
          </div>
          <div className="audit-log-row">
            <span>Current session</span>
            <span>Recommendation generation</span>
            <span>{user.email}</span>
            <span className="status-chip">Compliant</span>
          </div>
          <div className="audit-log-row">
            <span>Current session</span>
            <span>RBAC session active</span>
            <span>{user.role.replace("_", " ")}</span>
            <span className="status-chip">Protected</span>
          </div>
        </div>
      </section>

      <section className="concept-panel workforce-panel">
        <div className="panel-heading">
          <h2>Workforce Gap Report</h2>
          <span>{selectedRole.title}</span>
        </div>
        <div className="gap-bars">
          {(workforceGaps.length ? workforceGaps : selectedRole.requiredSkills.slice(0, 5).map((skill, index) => [skill, 5 - index] as [string, number])).map(
            ([skill, count]) => (
              <div key={skill}>
                <span>{skill}</span>
                <meter value={Number(count)} min={0} max={Math.max(files.length, 5)} />
                <strong>{Number(count)}</strong>
              </div>
            )
          )}
        </div>
        <div className="system-health">
          <Activity aria-hidden="true" />
          <span>API healthy</span>
          <span>Queue backlog: {isUploading ? files.length : 0}</span>
          <span>Retry policy: enabled</span>
        </div>
      </section>
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
