import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { extractResumeText, normalizeExtractedResumeText } from "@/lib/resume-parser";

function makeFile(bytes: Buffer, name: string, type: string) {
  return new File([bytes], name, { type });
}

async function createPdf(lines: string[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ bufferPages: true, margin: 48 });
    const chunks: Buffer[] = [];

    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    document.fontSize(16).text(lines[0]);
    document.moveDown();

    for (const line of lines.slice(1)) {
      document.fontSize(11).text(line);
    }

    document.end();
  });
}

async function createImageOnlyPdf() {
  const blankPdf = await createPdf([""]);
  return Buffer.concat([blankPdf, Buffer.from("\n% scanned page marker /Subtype /Image\n")]);
}

describe("resume parser", () => {
  it("extracts readable resume text from a real PDF fixture", async () => {
    const bytes = await readFile("tests/fixtures/alex-smith-sde-resume.pdf");
    const result = await extractResumeText(makeFile(bytes, "alex-smith-sde-resume.pdf", "application/pdf"));

    expect(result.text).toContain("Alex Smith");
    expect(result.text).toContain("Skills: Java, AWS, SQL, REST API, Git, System Design, Data Structures, Docker.");
    expect(result.text).not.toMatch(/--\s+1\s+of\s+1\s+--/);
  });

  it("extracts text from generated PDFs without relying on raw stream token regexes", async () => {
    const bytes = await createPdf([
      "Priya Raman",
      "Backend engineer with 6 years of TypeScript, Node, AWS, PostgreSQL, Docker, and CI/CD experience.",
      "Experience",
      "Built REST APIs and search pipelines for resume matching workflows.",
      "Skills",
      "TypeScript, Node, AWS, PostgreSQL, Docker, CI/CD, REST API, system design.",
      "Education",
      "Bachelor of Science in Computer Science"
    ]);

    const result = await extractResumeText(makeFile(bytes, "priya-raman.pdf", "application/pdf"));

    expect(result.text).toContain("Priya Raman");
    expect(result.text).toContain("TypeScript, Node, AWS, PostgreSQL, Docker, and CI/CD");
    expect(result.text).toContain("REST APIs and search pipelines");
  });

  it("rejects blank PDFs with a clear message", async () => {
    const blankPdf = await createPdf([""]);

    await expect(extractResumeText(makeFile(blankPdf, "blank.pdf", "application/pdf"))).rejects.toThrow(
      "appears blank"
    );
  });

  it("rejects image-only PDFs with a scanned-PDF MVP message", async () => {
    const imageOnlyPdf = await createImageOnlyPdf();

    await expect(extractResumeText(makeFile(imageOnlyPdf, "scan.pdf", "application/pdf"))).rejects.toThrow(
      "Image-only or scanned PDF resumes are not supported in this MVP"
    );
  });

  it("rejects corrupt PDFs with a supported/corrupt message", async () => {
    await expect(
      extractResumeText(makeFile(Buffer.from("not actually a pdf"), "corrupt.pdf", "application/pdf"))
    ).rejects.toThrow("corrupt, encrypted, or an unsupported PDF");
  });

  it("normalizes whitespace while preserving useful line breaks", () => {
    expect(normalizeExtractedResumeText(" Alex   Smith \r\n\r\n Skills:   Java,    AWS \n\n\n Experience:  5 years ")).toBe(
      "Alex Smith\n\nSkills: Java, AWS\n\nExperience: 5 years"
    );
  });

  it("rejects PDFs with too little usable text", async () => {
    const shortPdf = await createPdf(["Hi"]);

    await expect(extractResumeText(makeFile(shortPdf, "short.pdf", "application/pdf"))).rejects.toThrow(
      "too little usable resume text"
    );
  });
});
