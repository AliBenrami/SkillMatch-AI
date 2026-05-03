import { describe, expect, it, vi } from "vitest";
import { generateResumeAiInsight, getResumeAiInsightConfig } from "@/lib/resume-ai-insight";

describe("resume AI insight", () => {
  it("returns null when no API key is configured", () => {
    expect(getResumeAiInsightConfig({})).toBeNull();
  });

  it("reads configuration from GEMINI_API_KEY", () => {
    expect(
      getResumeAiInsightConfig({
        GEMINI_API_KEY: "test-key"
      })
    ).toEqual({
      apiKey: "test-key",
      model: "gemini-2.0-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta"
    });
  });

  it("prefers GEMINI_API_KEY over GOOGLE_API_KEY", () => {
    expect(
      getResumeAiInsightConfig({
        GEMINI_API_KEY: "gemini-first",
        GOOGLE_API_KEY: "google-second"
      })
    ).toMatchObject({ apiKey: "gemini-first" });
  });

  it("falls back to RESUME_AI_API_KEY and RESUME_AI_MODEL", () => {
    expect(
      getResumeAiInsightConfig({
        RESUME_AI_API_KEY: "legacy",
        RESUME_AI_MODEL: "gemini-1.5-flash",
        GEMINI_BASE_URL: "https://example.com/v1beta/"
      })
    ).toEqual({
      apiKey: "legacy",
      model: "gemini-1.5-flash",
      baseUrl: "https://example.com/v1beta"
    });
  });

  it("parses a successful Gemini generateContent response into structured insight", async () => {
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
          candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }]
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateResumeAiInsight({
      config: {
        apiKey: "k",
        model: "gemini-2.0-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta"
      },
      maskedResumeText: "Engineer with Java and AWS.",
      topRoleTitles: ["Software Dev Engineer II"],
      candidateLabel: "Jamie"
    });

    vi.unstubAllGlobals();

    expect(result).toEqual(payload);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callUrl = String(mockFetch.mock.calls[0]?.[0]);
    expect(callUrl).toContain("/models/gemini-2.0-flash:generateContent");
    expect(callUrl).toContain("key=k");
  });

  it("returns null on HTTP errors", async () => {
    const mockFetch = vi.fn(async () => new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await generateResumeAiInsight({
      config: {
        apiKey: "k",
        model: "m",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta"
      },
      maskedResumeText: "x".repeat(40),
      topRoleTitles: ["Role A"],
      candidateLabel: "x"
    });

    vi.unstubAllGlobals();

    expect(result).toBeNull();
  });
});
