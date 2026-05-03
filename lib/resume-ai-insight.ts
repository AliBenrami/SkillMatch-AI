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

const defaultBaseUrl = "https://api.openai.com/v1";

export function getResumeAiInsightConfig(env: NodeJS.ProcessEnv = process.env): ResumeAiInsightConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim() || env.RESUME_AI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = env.RESUME_AI_MODEL?.trim() || "gpt-4o-mini";
  const baseUrl = (
    env.OPENAI_BASE_URL?.trim() ||
    env.RESUME_AI_BASE_URL?.trim() ||
    defaultBaseUrl
  ).replace(/\/$/, "");

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

  const response = await fetch(`${input.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.config.model,
      temperature: 0.25,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPayload }
      ]
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
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
