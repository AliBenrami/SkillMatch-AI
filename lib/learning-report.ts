import { roles, type RoleRequirement } from "./seed-data";
import type { CandidateAnalysis } from "./skillmatch";

export type GroupingDimension = "department" | "employee_group" | "role_family";

export type LearningReportGroup = {
  dimension: GroupingDimension;
  groupId: string;
  groupName: string;
  candidateCount: number;
  topMissingSkills: Array<{
    skill: string;
    affectedCandidates: number;
    recommendation: string;
  }>;
  prioritizedRecommendation: string;
};

export type LearningReport = {
  generatedAt: string;
  totalCandidates: number;
  topMissingSkills: Array<{
    skill: string;
    affectedCandidates: number;
    recommendation: string;
  }>;
  byDepartment: LearningReportGroup[];
  byEmployeeGroup: LearningReportGroup[];
  byRoleFamily: LearningReportGroup[];
};

const employeeGroupForLevel: Record<string, string> = {
  Entry: "Early Career",
  Associate: "Early Career",
  Mid: "Mid Career",
  Senior: "Experienced",
  Principal: "Experienced",
};

function deriveEmployeeGroup(role: RoleRequirement): { id: string; name: string } {
  const name = employeeGroupForLevel[role.level] ?? role.level;
  return { id: name.toLowerCase().replace(/\s+/g, "-"), name };
}

function findLearningRecommendationForSkill(skill: string): string {
  for (const role of roles) {
    const course = role.learning[skill];
    if (course) {
      return course;
    }
  }
  return `Identify a learning module that builds ${skill} fluency.`;
}

type CandidateGroupView = {
  candidate: CandidateAnalysis;
  role: RoleRequirement;
  missingSkills: string[];
};

function getBestRoleForCandidate(candidate: CandidateAnalysis): RoleRequirement | null {
  const best = candidate.topPositions[0];
  if (!best) {
    return null;
  }
  return roles.find((role) => role.id === best.role.id) ?? null;
}

function buildCandidateView(candidate: CandidateAnalysis): CandidateGroupView | null {
  const role = getBestRoleForCandidate(candidate);
  if (!role) {
    return null;
  }
  const missingSkills = candidate.topPositions[0]?.missingSkills.map((gap) => gap.skill) ?? [];
  return { candidate, role, missingSkills };
}

function aggregateGroup(
  dimension: GroupingDimension,
  views: CandidateGroupView[],
  resolveGroup: (view: CandidateGroupView) => { id: string; name: string },
): LearningReportGroup[] {
  const buckets = new Map<
    string,
    {
      groupName: string;
      candidates: Set<string>;
      skillCounts: Map<string, Set<string>>;
    }
  >();

  for (const view of views) {
    const { id, name } = resolveGroup(view);
    if (!buckets.has(id)) {
      buckets.set(id, {
        groupName: name,
        candidates: new Set<string>(),
        skillCounts: new Map<string, Set<string>>(),
      });
    }
    const bucket = buckets.get(id)!;
    bucket.candidates.add(view.candidate.id);
    for (const skill of view.missingSkills) {
      if (!bucket.skillCounts.has(skill)) {
        bucket.skillCounts.set(skill, new Set<string>());
      }
      bucket.skillCounts.get(skill)!.add(view.candidate.id);
    }
  }

  return Array.from(buckets.entries())
    .map(([groupId, bucket]) => {
      const topMissingSkills = Array.from(bucket.skillCounts.entries())
        .map(([skill, owners]) => ({
          skill,
          affectedCandidates: owners.size,
          recommendation: findLearningRecommendationForSkill(skill),
        }))
        .sort((a, b) => b.affectedCandidates - a.affectedCandidates || a.skill.localeCompare(b.skill))
        .slice(0, 5);

      const prioritizedRecommendation = topMissingSkills.length
        ? `Prioritize ${topMissingSkills
            .slice(0, 3)
            .map((entry) => entry.skill)
            .join(", ")} learning paths for ${bucket.groupName}.`
        : `${bucket.groupName} has no recurring skill gaps in the current sample.`;

      return {
        dimension,
        groupId,
        groupName: bucket.groupName,
        candidateCount: bucket.candidates.size,
        topMissingSkills,
        prioritizedRecommendation,
      };
    })
    .sort((a, b) => b.candidateCount - a.candidateCount || a.groupName.localeCompare(b.groupName));
}

function aggregateTopMissingSkills(views: CandidateGroupView[]) {
  const counts = new Map<string, Set<string>>();

  for (const view of views) {
    for (const skill of new Set(view.missingSkills)) {
      if (!counts.has(skill)) {
        counts.set(skill, new Set<string>());
      }
      counts.get(skill)!.add(view.candidate.id);
    }
  }

  return Array.from(counts.entries())
    .map(([skill, owners]) => ({
      skill,
      affectedCandidates: owners.size,
      recommendation: findLearningRecommendationForSkill(skill),
    }))
    .sort((a, b) => b.affectedCandidates - a.affectedCandidates || a.skill.localeCompare(b.skill))
    .slice(0, 8);
}

export function buildLearningReport(candidates: CandidateAnalysis[]): LearningReport {
  const views = candidates
    .map(buildCandidateView)
    .filter((view): view is CandidateGroupView => view !== null);

  return {
    generatedAt: new Date().toISOString(),
    totalCandidates: views.length,
    topMissingSkills: aggregateTopMissingSkills(views),
    byDepartment: aggregateGroup("department", views, ({ role }) => ({
      id: role.department.toLowerCase().replace(/\s+/g, "-"),
      name: role.department,
    })),
    byEmployeeGroup: aggregateGroup("employee_group", views, ({ role }) => deriveEmployeeGroup(role)),
    byRoleFamily: aggregateGroup("role_family", views, ({ role }) => ({
      id: role.family.toLowerCase().replace(/\s+/g, "-"),
      name: role.family,
    })),
  };
}
