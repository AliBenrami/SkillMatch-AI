import { describe, expect, it, vi } from "vitest";
import { generateResumeAiInsight, getResumeAiInsightConfig } from "@/lib/resume-ai-insight";

describe("resume AI insight", () => {
  it("returns null when no API key is configured", () => {
    expect(getResumeAiInsightConfig({})).toBeNull();
  });

  it("reads configuration from OPENAI_API_KEY", () => {
    expect(
      getResumeAiInsightConfig({
        OPENAI_API_KEY: "test-key"
      })
    ).toEqual({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1"
    });
  });

  it("falls back to RESUME_AI_API_KEY", () => {
    expect(
      getResumeAiInsightConfig({
        RESUME_AI_API_KEY: "other",
        RESUME_AI_MODEL: "custom-model",
        RESUME_AI_BASE_URL: "https://example.com/v1/"
      })
    ).toEqual({
      apiKey: "other",
      model: "custom-model",
      baseUrl: "https://example.com/v1"
    });
  });

  it("parses a successful chat completion into structured insight", async () => {
    const payload = {
      summary: "Strong backend engineer.",
      strengths: ["Distributed systems"],
      developmentAreas: ["Front-end depth"],
      roleFitNotes: "Fits SDE II well.",
      followUpQuestions: ["Tell me about team size."]
    };

    const mockFetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload) } }]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateResumeAiInsight({
      config: { apiKey: "k", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
      maskedResumeText: "Engineer with Java and AWS.",
      topRoleTitles: ["Software Dev Engineer II"],
      candidateLabel: "Jamie"
    });

    vi.unstubAllGlobals();

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null on HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));

    const result = await generateResumeAiInsight({
      config: { apiKey: "k", model: "m", baseUrl: "https://api.openai.com/v1" },
      maskedResumeText: "x".repeat(40),
      topRoleTitles: ["Role A"],
      candidateLabel: "x"
    });

    vi.unstubAllGlobals();

    expect(result).toBeNull();
  });
});
