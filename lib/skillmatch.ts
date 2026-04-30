import { roles, type RoleRequirement } from "./seed-data";

export type SkillMatchResult = {
  role: RoleRequirement;
  extractedSkills: string[];
  structured: StructuredResume;
  matchedSkills: string[];
  missingSkills: Array<{
    skill: string;
    importance: "critical" | "important";
    recommendation: string;
  }>;
  score: number;
  explanation: string;
};

export type StructuredResume = {
  skills: string[];
  yearsExperience: number | null;
  education: string[];
  certifications: string[];
  biasMaskedText: string;
};

export type CandidatePositionRecommendation = SkillMatchResult & {
  rank: number;
};

export type CandidateAnalysis = {
  id: string;
  candidateName: string;
  fileName: string;
  storageUrl: string;
  topPositions: CandidatePositionRecommendation[];
  structured: StructuredResume;
  createdAt: string;
};

const skillVocabulary = Array.from(
  new Set(
    roles.flatMap((role) => [...role.requiredSkills, ...role.preferredSkills])
  )
).sort((a, b) => b.length - a.length);

const certificationPatterns = [
  /aws certified[^,\n.]*/gi,
  /cloud practitioner/gi,
  /security\+/gi,
  /cissp/gi,
  /pmp/gi,
  /scrum master/gi
];

export function normalizeResumeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function maskDemographicSignals(text: string) {
  return text
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\s*$/gm, "[name masked]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masked]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone masked]")
    .replace(/\b(?:age|dob|date of birth)\s*[:\-]?\s*\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi, "[age masked]");
}

export function extractSkills(resumeText: string) {
  const normalized = normalizeResumeText(resumeText);
  return skillVocabulary.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i").test(normalized);
  });
}

export function extractStructuredResume(resumeText: string): StructuredResume {
  const normalized = normalizeResumeText(resumeText);
  const yearsMatch =
    normalized.match(/(\d{1,2})\+?\s*(?:years|yrs)\s*(?:of\s*)?(?:experience|exp)/) ??
    normalized.match(/experience\s*[:\-]?\s*(\d{1,2})\+?\s*(?:years|yrs)/);
  const education = [
    ["bachelor", "Bachelor's degree"],
    ["master", "Master's degree"],
    ["phd", "PhD"],
    ["computer science", "Computer Science"],
    ["cognitive science", "Cognitive Science"]
  ]
    .filter(([token]) => normalized.includes(token))
    .map(([, label]) => label);
  const certifications = certificationPatterns
    .flatMap((pattern) => resumeText.match(pattern) ?? [])
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);

  return {
    skills: extractSkills(resumeText),
    yearsExperience: yearsMatch ? Number(yearsMatch[1]) : null,
    education,
    certifications,
    biasMaskedText: maskDemographicSignals(resumeText)
  };
}

export function analyzeResume(resumeText: string, roleId: string): SkillMatchResult {
  const role = roles.find((item) => item.id === roleId) ?? roles[0];
  const structured = extractStructuredResume(resumeText);
  const extractedSkills = structured.skills;
  const extracted = new Set(extractedSkills);
  const allRoleSkills = [...role.requiredSkills, ...role.preferredSkills];
  const matchedSkills = allRoleSkills.filter((skill) => extracted.has(skill));
  const missingRequired = role.requiredSkills.filter((skill) => !extracted.has(skill));
  const missingPreferred = role.preferredSkills.filter((skill) => !extracted.has(skill));

  const requiredWeight = role.requiredSkills.length * 2;
  const preferredWeight = role.preferredSkills.length;
  const earned =
    role.requiredSkills.filter((skill) => extracted.has(skill)).length * 2 +
    role.preferredSkills.filter((skill) => extracted.has(skill)).length;
  const score = Math.round((earned / (requiredWeight + preferredWeight)) * 100);

  const missingSkills = [
    ...missingRequired.map((skill) => ({
      skill,
      importance: "critical" as const,
      recommendation: role.learning[skill] ?? `Complete focused training for ${skill}.`
    })),
    ...missingPreferred.map((skill) => ({
      skill,
      importance: "important" as const,
      recommendation: role.learning[skill] ?? `Review applied ${skill} practice.`
    }))
  ];

  return {
    role,
    extractedSkills,
    structured,
    matchedSkills,
    missingSkills,
    score,
    explanation: `Score is based on weighted overlap with ${role.title}: required skills count twice, preferred skills count once. ${matchedSkills.length} role skills matched and ${missingSkills.length} gaps remain. Demographic contact signals are masked before recommendation review.`
  };
}

export function inferCandidateName(fileName: string, resumeText: string) {
  const firstLine = resumeText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(line));

  if (firstLine) {
    return firstLine;
  }

  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bresume\b/gi, "")
    .trim() || "Candidate";
}

export function rankResumeForPositions(resumeText: string) {
  return roles
    .map((role) => analyzeResume(resumeText, role.id))
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1
    })) satisfies CandidatePositionRecommendation[];
}

export function analyzeCandidateResume(input: {
  fileName: string;
  resumeText: string;
  storageUrl: string;
}): CandidateAnalysis {
  const topPositions = rankResumeForPositions(input.resumeText);
  return {
    id: crypto.randomUUID(),
    candidateName: inferCandidateName(input.fileName, input.resumeText),
    fileName: input.fileName,
    storageUrl: input.storageUrl,
    topPositions,
    structured: topPositions[0]?.structured ?? extractStructuredResume(input.resumeText),
    createdAt: new Date().toISOString()
  };
}
