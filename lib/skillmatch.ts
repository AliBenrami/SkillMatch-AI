import { matchingConfig, roles, type RoleRequirement } from "./seed-data";
import type { ResumeAiInsight } from "./resume-ai-insight";
import { isKnownRoleId } from "./validation";

type SkillSource =
  | "required-skill"
  | "preferred-skill"
  | "required-soft-skill"
  | "preferred-soft-skill";

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
  requiredSkills: {
    matched: number;
    total: number;
    missing: string[];
  };
  preferredSkills: {
    matched: number;
    total: number;
    missing: string[];
  };
  softSkills: {
    matched: number;
    total: number;
    missing: string[];
  };
  certifications: {
    matched: number;
    total: number;
    matchedItems: string[];
    missing: string[];
  };
  experience: {
    candidateYears: number | null;
    minimumYears: number;
    idealYears: number;
    earnedWeight: number;
    meetsMinimum: boolean;
    meetsIdeal: boolean;
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
    category: "skill" | "soft-skill" | "certification" | "experience";
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
  aiInsight: ResumeAiInsight | null;
  createdAt: string;
};

const canonicalSkills = Array.from(
  new Set(
    roles.flatMap((role) => [
      ...role.requiredSkills,
      ...role.preferredSkills,
      ...role.requiredSoftSkills,
      ...role.preferredSoftSkills
    ])
  )
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

function normalizeIdentifier(value: string) {
  return normalizeResumeText(value);
}

function findMatchingCertification(
  extractedCertifications: string[],
  certification: string
) {
  const normalizedCertification = normalizeIdentifier(certification);
  return (
    extractedCertifications.find((item) => {
      const normalizedItem = normalizeIdentifier(item);
      return (
        normalizedItem.includes(normalizedCertification) ||
        normalizedCertification.includes(normalizedItem)
      );
    }) ?? null
  );
}

function calculateExperienceWeight(
  candidateYears: number | null,
  minimumYears: number,
  idealYears: number
) {
  if (candidateYears === null) {
    return 0;
  }

  if (candidateYears >= idealYears) {
    return matchingConfig.scoringWeights.experience;
  }

  if (candidateYears >= minimumYears) {
    if (idealYears <= minimumYears) {
      return matchingConfig.scoringWeights.experience;
    }

    const progress = (candidateYears - minimumYears) / (idealYears - minimumYears);
    return matchingConfig.scoringWeights.experience * (0.75 + progress * 0.25);
  }

  if (minimumYears <= 0) {
    return 0;
  }

  return matchingConfig.scoringWeights.experience * Math.min(candidateYears / minimumYears, 0.5);
}

export function analyzeResume(resumeText: string, roleId: string): SkillMatchResult {
  const safeRoleId = isKnownRoleId(roleId) ? roleId : roles[0].id;
  const role = roles.find((item) => item.id === safeRoleId) ?? roles[0];
  const structured = extractStructuredResume(resumeText);
  const extractedSkills = structured.skills;
  const extracted = new Set(extractedSkills);
  const skillAndSoftSkillTargets = [
    ...role.requiredSkills,
    ...role.preferredSkills,
    ...role.requiredSoftSkills,
    ...role.preferredSoftSkills
  ];
  const matchedSkills = skillAndSoftSkillTargets.filter((skill) => extracted.has(skill));
  const missingRequiredSkills = role.requiredSkills.filter((skill) => !extracted.has(skill));
  const missingPreferredSkills = role.preferredSkills.filter((skill) => !extracted.has(skill));
  const missingRequiredSoftSkills = role.requiredSoftSkills.filter((skill) => !extracted.has(skill));
  const missingPreferredSoftSkills = role.preferredSoftSkills.filter((skill) => !extracted.has(skill));
  const matchedRequiredCertifications = role.requiredCertifications
    .map((certification) => findMatchingCertification(structured.certifications, certification))
    .filter((certification): certification is string => Boolean(certification));
  const matchedPreferredCertifications = role.preferredCertifications
    .map((certification) => findMatchingCertification(structured.certifications, certification))
    .filter((certification): certification is string => Boolean(certification));
  const missingRequiredCertifications = role.requiredCertifications.filter(
    (certification) => !findMatchingCertification(structured.certifications, certification)
  );
  const missingPreferredCertifications = role.preferredCertifications.filter(
    (certification) => !findMatchingCertification(structured.certifications, certification)
  );
  const {
    requiredSkill,
    preferredSkill,
    requiredCertification,
    preferredCertification,
    experience,
    requiredSoftSkill,
    preferredSoftSkill
  } = matchingConfig.scoringWeights;

  const possibleWeight =
    role.requiredSkills.length * requiredSkill +
    role.preferredSkills.length * preferredSkill +
    role.requiredCertifications.length * requiredCertification +
    role.preferredCertifications.length * preferredCertification +
    experience +
    role.requiredSoftSkills.length * requiredSoftSkill +
    role.preferredSoftSkills.length * preferredSoftSkill;
  const earned =
    (role.requiredSkills.length - missingRequiredSkills.length) * requiredSkill +
    (role.preferredSkills.length - missingPreferredSkills.length) * preferredSkill +
    matchedRequiredCertifications.length * requiredCertification +
    matchedPreferredCertifications.length * preferredCertification +
    calculateExperienceWeight(
      structured.yearsExperience,
      role.minimumYearsExperience,
      role.idealYearsExperience
    ) +
    (role.requiredSoftSkills.length - missingRequiredSoftSkills.length) * requiredSoftSkill +
    (role.preferredSoftSkills.length - missingPreferredSoftSkills.length) * preferredSoftSkill;
  const score = possibleWeight > 0 ? Math.round((earned / possibleWeight) * 100) : 0;

  const normalizedResume = normalizeResumeText(resumeText);
  const evidence = skillAndSoftSkillTargets
    .filter((skill) => extracted.has(skill))
    .map((skill) => {
      const source: SkillSource = role.requiredSkills.includes(skill)
        ? "required-skill"
        : role.preferredSkills.includes(skill)
          ? "preferred-skill"
          : role.requiredSoftSkills.includes(skill)
            ? "required-soft-skill"
            : "preferred-soft-skill";
      const terms = skillTerms.get(skill) ?? [skill];
      return {
        skill,
        matchedText: findMatchedTerm(normalizedResume, skill) ?? skill,
        snippet: findEvidenceSnippet(resumeText, terms),
        source,
        weight:
          source === "required-skill"
            ? requiredSkill
            : source === "preferred-skill"
              ? preferredSkill
              : source === "required-soft-skill"
                ? requiredSoftSkill
                : preferredSoftSkill
      };
    });

  const missingSkills = [
    ...missingRequiredSkills.map((skill) => ({
      skill,
      category: "skill" as const,
      importance: "critical" as const,
      recommendation: role.learning[skill] ?? `Complete focused training for ${skill}.`
    })),
    ...missingPreferredSkills.map((skill) => ({
      skill,
      category: "skill" as const,
      importance: "important" as const,
      recommendation: role.learning[skill] ?? `Review applied ${skill} practice.`
    })),
    ...missingRequiredSoftSkills.map((skill) => ({
      skill,
      category: "soft-skill" as const,
      importance: "critical" as const,
      recommendation: role.learning[skill] ?? `Practice role-relevant examples that demonstrate ${skill}.`
    })),
    ...missingPreferredSoftSkills.map((skill) => ({
      skill,
      category: "soft-skill" as const,
      importance: "important" as const,
      recommendation: role.learning[skill] ?? `Strengthen evidence of ${skill} through recent projects.`
    })),
    ...missingRequiredCertifications.map((skill) => ({
      skill,
      category: "certification" as const,
      importance: "critical" as const,
      recommendation: role.learning[skill] ?? `Complete the certification path for ${skill}.`
    })),
    ...missingPreferredCertifications.map((skill) => ({
      skill,
      category: "certification" as const,
      importance: "important" as const,
      recommendation: role.learning[skill] ?? `Consider adding ${skill} to strengthen role readiness.`
    })),
    ...(structured.yearsExperience !== null && structured.yearsExperience >= role.minimumYearsExperience
      ? []
      : [
          {
            skill: `${role.minimumYearsExperience}+ years of experience`,
            category: "experience" as const,
            importance: "critical" as const,
            recommendation: `Build more directly relevant experience toward the ${role.minimumYearsExperience}-year baseline for ${role.title}.`
          }
        ]),
    ...(structured.yearsExperience !== null && structured.yearsExperience >= role.idealYearsExperience
      ? []
      : [
          {
            skill: `${role.idealYearsExperience}+ years of experience`,
            category: "experience" as const,
            importance: "important" as const,
            recommendation: `Continue building depth toward the ${role.idealYearsExperience}-year target for stronger leveling confidence.`
          }
        ])
  ];

  const experienceWeight = calculateExperienceWeight(
    structured.yearsExperience,
    role.minimumYearsExperience,
    role.idealYearsExperience
  );
  const explanationDetails: SkillMatchExplanationDetails = {
    weights: matchingConfig.scoringWeights,
    earnedWeight: earned,
    possibleWeight,
    requiredSkills: {
      matched: role.requiredSkills.length - missingRequiredSkills.length,
      total: role.requiredSkills.length,
      missing: missingRequiredSkills
    },
    preferredSkills: {
      matched: role.preferredSkills.length - missingPreferredSkills.length,
      total: role.preferredSkills.length,
      missing: missingPreferredSkills
    },
    softSkills: {
      matched:
        role.requiredSoftSkills.length +
        role.preferredSoftSkills.length -
        missingRequiredSoftSkills.length -
        missingPreferredSoftSkills.length,
      total: role.requiredSoftSkills.length + role.preferredSoftSkills.length,
      missing: [...missingRequiredSoftSkills, ...missingPreferredSoftSkills]
    },
    certifications: {
      matched: matchedRequiredCertifications.length + matchedPreferredCertifications.length,
      total: role.requiredCertifications.length + role.preferredCertifications.length,
      matchedItems: [...matchedRequiredCertifications, ...matchedPreferredCertifications],
      missing: [...missingRequiredCertifications, ...missingPreferredCertifications]
    },
    experience: {
      candidateYears: structured.yearsExperience,
      minimumYears: role.minimumYearsExperience,
      idealYears: role.idealYearsExperience,
      earnedWeight: experienceWeight,
      meetsMinimum:
        structured.yearsExperience !== null && structured.yearsExperience >= role.minimumYearsExperience,
      meetsIdeal:
        structured.yearsExperience !== null && structured.yearsExperience >= role.idealYearsExperience
    },
    evidence,
    rankingFactors: [
      `${role.requiredSkills.length - missingRequiredSkills.length}/${role.requiredSkills.length} required hard skills matched`,
      `${role.preferredSkills.length - missingPreferredSkills.length}/${role.preferredSkills.length} preferred hard skills matched`,
      `${role.requiredSoftSkills.length + role.preferredSoftSkills.length - missingRequiredSoftSkills.length - missingPreferredSoftSkills.length}/${role.requiredSoftSkills.length + role.preferredSoftSkills.length} soft skills matched`,
      `${matchedRequiredCertifications.length + matchedPreferredCertifications.length}/${role.requiredCertifications.length + role.preferredCertifications.length} certifications matched`,
      `Experience signal contributed ${experienceWeight.toFixed(2)}/${experience} weighted points`,
      `${earned.toFixed(2)}/${possibleWeight} weighted points earned`
    ]
  };

  return {
    role,
    extractedSkills,
    structured,
    matchedSkills,
    missingSkills,
    score,
    explanation: `Score is based on configurable weighted overlap with ${role.title}: required hard skills count ${requiredSkill}x, preferred hard skills count ${preferredSkill}x, required certifications count ${requiredCertification}x, preferred certifications count ${preferredCertification}x, experience contributes ${experience} points, and soft skills count ${requiredSoftSkill}x/${preferredSoftSkill}x. ${explanationDetails.requiredSkills.matched} of ${role.requiredSkills.length} required hard skills, ${explanationDetails.preferredSkills.matched} of ${role.preferredSkills.length} preferred hard skills, ${explanationDetails.softSkills.matched} of ${explanationDetails.softSkills.total} soft skills, and ${explanationDetails.certifications.matched} of ${explanationDetails.certifications.total} certifications matched. Candidate experience is ${structured.yearsExperience ?? "unknown"} years against a ${role.minimumYearsExperience}-${role.idealYearsExperience}+ year target (${earned.toFixed(2)}/${possibleWeight} weighted points). Evidence snippets are captured for matched competencies, and demographic contact signals are masked before recommendation review.`,
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
    aiInsight: null,
    createdAt: new Date().toISOString()
  };
}
