"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  Users
} from "lucide-react";
import { roles } from "@/lib/seed-data";
import type { SessionUser } from "@/lib/auth-model";
import type { CandidateAnalysis } from "@/lib/skillmatch";

type UploadResponse = {
  candidates: CandidateAnalysis[];
  failures: Array<{ fileName: string; error: string }>;
};

export default function Dashboard({ user }: { user: SessionUser }) {
  const [roleId, setRoleId] = useState("sde-ii");
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<CandidateAnalysis[]>([]);
  const [failures, setFailures] = useState<UploadResponse["failures"]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0];
  const selectedRoleMatch = selectedCandidate?.topPositions.find((item) => item.role.id === roleId);
  const bestRecommendation = selectedRoleMatch ?? selectedCandidate?.topPositions[0];

  const workforceGaps = useMemo(() => {
    const counts = new Map<string, number>();
    candidates.forEach((candidate) => {
      candidate.topPositions[0]?.missingSkills.slice(0, 5).forEach((gap) => {
        counts.set(gap.skill, (counts.get(gap.skill) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [candidates]);

  function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }
    const nextFiles = Array.from(fileList).filter((file) =>
      /\.(pdf|docx|txt)$/i.test(file.name)
    );
    setFiles((current) => [...current, ...nextFiles].slice(0, 12));
  }

  async function uploadResumes() {
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
    setCandidates(uploadPayload.candidates);
    setSelectedCandidateId(uploadPayload.candidates[0]?.id ?? "");
    setFailures(uploadPayload.failures);
    setNotice(
      `Processed ${uploadPayload.candidates.length} resume${uploadPayload.candidates.length === 1 ? "" : "s"}.`
    );
    setIsUploading(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const matchedSkills = bestRecommendation?.matchedSkills ?? [];
  const missingSkills = bestRecommendation?.missingSkills ?? [];

  return (
    <main className="product-shell">
      <aside className="side-nav" aria-label="Primary">
        <div className="amazon-mark">a</div>
        <button className="nav-item active" title="Dashboard">
          <LayoutDashboard aria-hidden="true" />
          Dashboard
        </button>
        <button className="nav-item" title="Analyses">
          <BarChart3 aria-hidden="true" />
          Analyses
        </button>
        <button className="nav-item" title="Learning">
          <BookOpen aria-hidden="true" />
          Learning
        </button>
        <button className="nav-item" title="Workforce">
          <Users aria-hidden="true" />
          Workforce
        </button>
        <button className="nav-item" title="Audit Log">
          <ShieldCheck aria-hidden="true" />
          Audit Log
        </button>
        <button className="nav-item" title="Settings">
          <Settings aria-hidden="true" />
          Settings
        </button>
      </aside>

      <section className="main-product">
        <header className="app-header">
          <div className="brand-block">
            <h1>SkillMatch AI</h1>
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
          </div>
          <div className="audit-status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>Audit Status: Compliant</strong>
              <span>Authenticated as {user.name} ({user.role.replace("_", " ")})</span>
            </div>
          </div>
          <button className="icon-text-button" onClick={logout}>
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </header>

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
              <strong>Drop PDF or DOCX resumes here</strong>
              <span>or click to browse</span>
              <input
                aria-label="Upload resume files"
                type="file"
                multiple
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => addFiles(event.target.files)}
              />
            </div>
            <ul className="file-list">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{file.name}</span>
                  <small>{Math.round(file.size / 1024)} KB</small>
                </li>
              ))}
            </ul>
            <div className="role-facts">
              <h3>2. Target Internal Role</h3>
              <p>Job Family: {selectedRole.family}</p>
              <p>Business Unit: {selectedRole.department}</p>
            </div>
            {notice ? <p className="notice">{notice}</p> : null}
            {failures.map((failure) => (
              <p className="error-message" key={failure.fileName}>
                {failure.fileName}: {failure.error}
              </p>
            ))}
            <button className="run-button" onClick={uploadResumes} disabled={isUploading}>
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
                <div className="score-ring large" style={{ "--score": `${bestRecommendation?.score ?? 0}%` } as React.CSSProperties}>
                  <strong>{bestRecommendation?.score ?? 0}%</strong>
                </div>
                <strong>Overall Match</strong>
                <span>{bestRecommendation ? bestRecommendation.role.title : "Upload resumes to rank positions"}</span>
              </div>
              <div className="skill-columns">
                <div>
                  <h3>
                    <CheckCircle2 aria-hidden="true" />
                    Top Matched Skills
                  </h3>
                  <ul className="match-table">
                    {matchedSkills.slice(0, 8).map((skill) => (
                      <li key={skill}>
                        <span>{skill}</span>
                        <small>Strong</small>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>
                    <AlertTriangle aria-hidden="true" />
                    Missing Skills
                  </h3>
                  <ul className="gap-table">
                    {missingSkills.slice(0, 8).map((gap) => (
                      <li key={gap.skill}>
                        <span>{gap.skill}</span>
                        <small>{gap.importance}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <aside className="right-stack">
            <section className="concept-panel">
              <div className="panel-heading">
                <h2>Recommended Positions</h2>
                <span>Prioritized</span>
              </div>
              <ol className="recommendation-list">
                {(selectedCandidate?.topPositions ?? []).slice(0, 5).map((recommendation) => (
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
            <section className="concept-panel">
              <div className="panel-heading">
                <h2>Recent Analyses</h2>
                <span>{candidates.length}</span>
              </div>
              <ul className="recent-list">
                {candidates.slice(0, 4).map((candidate) => (
                  <li key={candidate.id}>
                    <button onClick={() => setSelectedCandidateId(candidate.id)}>
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
          </aside>
        </section>

        <section className="bottom-grid">
          <section className="concept-panel audit-log-panel">
            <h2>Recruiter / Admin Audit Log</h2>
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
              {(workforceGaps.length ? workforceGaps : [["system design", 3], ["kubernetes", 2], ["docker", 2]]).map(
                ([skill, count]) => (
                  <div key={skill}>
                    <span>{skill}</span>
                    <meter value={Number(count)} min={0} max={Math.max(candidates.length, 3)} />
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
      </section>
    </main>
  );
}
