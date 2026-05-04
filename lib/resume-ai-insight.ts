import { z } from "zod";

const resumeAiInsightSchema = z.object({
  summary: z.string().max(2800),
  strengths: z.array(z.string().max(600)).max(12),
  developmentAreas: z.array(z.string().max(600)).max(12),
  roleFitNotes: z.string().max(2000),
  followUpQuestions: z.array(z.string().max(500)).max(8)
});

export type ResumeAiInsight = z.infer<typeof resumeAiInsightSchema>;

export type ResumeAiInsightConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
};

const defaultGeminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";

export function getResumeAiInsightConfig(env: NodeJS.ProcessEnv = process.env): ResumeAiInsightConfig | null {
  const apiKey =
    env.GEMINI_API_KEY?.trim() ||
    env.GOOGLE_API_KEY?.trim() ||
    env.RESUME_AI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model =
    env.GEMINI_MODEL?.trim() ||
    env.RESUME_AI_MODEL?.trim() ||
    "gemini-2.0-flash";

  const baseUrl = (env.GEMINI_BASE_URL?.trim() || defaultGeminiBaseUrl).replace(/\/$/, "");

  return { apiKey, model, baseUrl };
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("No JSON object in model response");
  }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

export async function generateResumeAiInsight(input: {
  config: ResumeAiInsightConfig;
  maskedResumeText: string;
  topRoleTitles: string[];
  candidateLabel: string;
}): Promise<ResumeAiInsight | null> {
  const trimmedResume = input.maskedResumeText.slice(0, 14_000);
  const system = [
    "You are a senior technical recruiter assisting with structured resume review.",
    "The resume text may have demographics and contact details masked with tokens like [email masked].",
    "Respond with a single JSON object only (no markdown) using exactly these keys:",
    'summary (string), strengths (string[]), developmentAreas (string[]), roleFitNotes (string), followUpQuestions (string[]).',
    "Be specific and professional. Flag possible credential inflation only when justified by the text.",
    "Do not invent employers, degrees, or metrics that are not supported by the resume."
  ].join(" ");

  const userPayload = JSON.stringify({
    candidateLabel: input.candidateLabel,
    topRankedRoles: input.topRoleTitles,
    resumeText: trimmedResume
  });

  const endpoint = `${input.config.baseUrl}/models/${encodeURIComponent(input.config.model)}:generateContent`;
  const url = `${endpoint}?key=${encodeURIComponent(input.config.apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userPayload }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== "string") {
    return null;
  }

  try {
    const parsed = resumeAiInsightSchema.safeParse(extractJsonObject(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
