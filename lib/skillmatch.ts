import { matchingConfig, roles, type RoleRequirement } from "./seed-data";
import { isKnownRoleId } from "./validation";

type SkillSource = "required" | "preferred";

export type SkillMatchEvidence = {
  skill: string;
  matchedText: string;
  snippet: string;
  source: SkillSource;
  weight: number;
};

export type SkillMatchExplanationDetails = {
  weights: typeof matchingConfig.scoringWeights;
  earnedWeight: number;
  possibleWeight: number;
  required: {
    matched: number;
    total: number;
    missing: string[];
  };
  preferred: {
    matched: number;
    total: number;
    missing: string[];
  };
  evidence: SkillMatchEvidence[];
  rankingFactors: string[];
};

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
  explanationDetails: SkillMatchExplanationDetails;
};

export type StructuredResume = {
  skills: string[];
  yearsExperience: number | null;
  education: string[];
  location: string | null;
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

const canonicalSkills = Array.from(
  new Set(roles.flatMap((role) => [...role.requiredSkills, ...role.preferredSkills]))
);

const skillVocabulary = canonicalSkills.sort((a, b) => b.length - a.length);

const skillTerms = new Map(
  canonicalSkills.map((skill) => [
    skill,
    Array.from(new Set([skill, ...(matchingConfig.skillAliases[skill] ?? [])]))
  ])
);

const certificationPatterns = [
  /aws certified[^,\n.]*/gi,
  /cloud practitioner/gi,
  /security\+/gi,
  /cissp/gi,
  /pmp/gi,
  /scrum master/gi
];

const demographicMaskingRules: Array<[RegExp, string]> = [
  [/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\s*$/gm, "[name masked]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masked]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone masked]"],
  [
    /\b(?:age|dob|date of birth)\s*[:\-]?\s*(?:\d{1,3}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/gi,
    "[age masked]"
  ],
  [/\b\d{1,3}\s*(?:years old|yrs old|y\/o)\b/gi, "[age masked]"],
  [/\b(?:gender|sex)\s*[:\-]?\s*(?:female|male|woman|man|non[-\s]?binary|trans(?:gender)?|prefer not to say)\b/gi, "[gender masked]"],
  [/\bpronouns?\s*[:\-]?\s*[a-z]+\/[a-z]+\b/gi, "[pronouns masked]"],
  [
    /\b(?:race|ethnicity|nationality|citizenship|marital status|veteran status|disability status|religion)\s*[:\-]?\s*[^\r\n,;]+/gi,
    "[demographic masked]"
  ]
];

const knownLocations = [
  "Seattle, WA",
  "Austin, TX",
  "Dallas, TX",
  "Arlington, VA",
  "New York, NY",
  "Remote"
];

export function normalizeResumeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termMatchesNormalized(normalizedText: string, term: string) {
  const normalizedTerm = normalizeResumeText(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexibleTerm = normalizedTerm.replace(/\\\-/g, "[-\\s]+").replace(/\s+/g, "[-\\s]+");
  return new RegExp(`(^|\\s)${flexibleTerm}s?(\\s|$)`, "i").test(normalizedText);
}

function findMatchedTerm(normalizedText: string, skill: string) {
  return skillTerms.get(skill)?.find((term) => termMatchesNormalized(normalizedText, term)) ?? null;
}

function findEvidenceSnippet(resumeText: string, terms: string[]) {
  const segments =
    resumeText
      .split(/(?<=[.!?])\s+|\r?\n/)
      .map((segment) => segment.trim())
      .filter(Boolean);

  const matchedSegment = segments.find((segment) => {
    const normalizedSegment = normalizeResumeText(segment);
    return terms.some((term) => termMatchesNormalized(normalizedSegment, term));
  });

  return (matchedSegment ?? resumeText.trim()).slice(0, 180);
}

export function maskDemographicSignals(text: string) {
  return demographicMaskingRules.reduce(
    (maskedText, [pattern, replacement]) => maskedText.replace(pattern, replacement),
    text
  );
}

export function extractSkills(resumeText: string) {
  const normalized = normalizeResumeText(resumeText);
  return skillVocabulary.filter((skill) => Boolean(findMatchedTerm(normalized, skill)));
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
  const explicitLocation =
    resumeText.match(/\b(?:location|based in)\s*[:\-]?\s*([A-Za-z .'-]+,\s*[A-Z]{2}|remote)\b/i)?.[1]?.trim() ??
    null;
  const location =
    explicitLocation ??
    knownLocations.find((candidateLocation) => normalized.includes(normalizeResumeText(candidateLocation))) ??
    null;

  return {
    skills: extractSkills(resumeText),
    yearsExperience: yearsMatch ? Number(yearsMatch[1]) : null,
    education,
    location,
    certifications,
    biasMaskedText: maskDemographicSignals(resumeText)
  };
}

export function analyzeResume(resumeText: string, roleId: string): SkillMatchResult {
  const safeRoleId = isKnownRoleId(roleId) ? roleId : roles[0].id;
  const role = roles.find((item) => item.id === safeRoleId) ?? roles[0];
  const structured = extractStructuredResume(resumeText);
  const extractedSkills = structured.skills;
  const extracted = new Set(extractedSkills);
  const allRoleSkills = [...role.requiredSkills, ...role.preferredSkills];
  const matchedSkills = allRoleSkills.filter((skill) => extracted.has(skill));
  const missingRequired = role.requiredSkills.filter((skill) => !extracted.has(skill));
  const missingPreferred = role.preferredSkills.filter((skill) => !extracted.has(skill));
  const { required: requiredSkillWeight, preferred: preferredSkillWeight } = matchingConfig.scoringWeights;

  const requiredWeight = role.requiredSkills.length * requiredSkillWeight;
  const preferredWeight = role.preferredSkills.length * preferredSkillWeight;
  const earned =
    role.requiredSkills.filter((skill) => extracted.has(skill)).length * requiredSkillWeight +
    role.preferredSkills.filter((skill) => extracted.has(skill)).length * preferredSkillWeight;
  const possibleWeight = requiredWeight + preferredWeight;
  const score = possibleWeight > 0 ? Math.round((earned / possibleWeight) * 100) : 0;

  const normalizedResume = normalizeResumeText(resumeText);
  const evidence = allRoleSkills
    .filter((skill) => extracted.has(skill))
    .map((skill) => {
      const source: SkillSource = role.requiredSkills.includes(skill) ? "required" : "preferred";
      const terms = skillTerms.get(skill) ?? [skill];
      return {
        skill,
        matchedText: findMatchedTerm(normalizedResume, skill) ?? skill,
        snippet: findEvidenceSnippet(resumeText, terms),
        source,
        weight: source === "required" ? requiredSkillWeight : preferredSkillWeight
      };
    });

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

  const explanationDetails: SkillMatchExplanationDetails = {
    weights: matchingConfig.scoringWeights,
    earnedWeight: earned,
    possibleWeight,
    required: {
      matched: role.requiredSkills.length - missingRequired.length,
      total: role.requiredSkills.length,
      missing: missingRequired
    },
    preferred: {
      matched: role.preferredSkills.length - missingPreferred.length,
      total: role.preferredSkills.length,
      missing: missingPreferred
    },
    evidence,
    rankingFactors: [
      `${role.requiredSkills.length - missingRequired.length}/${role.requiredSkills.length} required skills matched`,
      `${role.preferredSkills.length - missingPreferred.length}/${role.preferredSkills.length} preferred skills matched`,
      `${earned}/${possibleWeight} weighted points earned`
    ]
  };

  return {
    role,
    extractedSkills,
    structured,
    matchedSkills,
    missingSkills,
    score,
    explanation: `Score is based on configurable weighted overlap with ${role.title}: required skills count ${requiredSkillWeight}x, preferred skills count ${preferredSkillWeight}x. ${explanationDetails.required.matched} of ${role.requiredSkills.length} required skills and ${explanationDetails.preferred.matched} of ${role.preferredSkills.length} preferred skills matched (${earned}/${possibleWeight} weighted points). Evidence snippets are captured for matched skills, and demographic contact signals are masked before recommendation review.`,
    explanationDetails
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
      rank: index + 1,
      explanationDetails: {
        ...result.explanationDetails,
        rankingFactors: [
          `Rank ${index + 1} of ${roles.length} by weighted skill score`,
          ...result.explanationDetails.rankingFactors
        ]
      }
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
