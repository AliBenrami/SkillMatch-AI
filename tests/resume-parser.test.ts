import { readFile } from "node:fs/promises";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "@/lib/resume-parser";

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
      "Backend engineer with TypeScript, Node, AWS, PostgreSQL, Docker, and CI/CD experience.",
      "Built REST APIs and search pipelines for resume matching workflows."
    ]);

    const result = await extractResumeText(makeFile(bytes, "priya-raman.pdf", "application/pdf"));

    expect(result.text).toContain("Priya Raman");
    expect(result.text).toContain("TypeScript, Node, AWS, PostgreSQL, Docker, and CI/CD");
    expect(result.text).toContain("REST APIs and search pipelines");
  });

  it("rejects PDFs that do not contain extractable text", async () => {
    const blankPdf = await createPdf([""]);

    await expect(extractResumeText(makeFile(blankPdf, "blank.pdf", "application/pdf"))).rejects.toThrow(
      "No readable text was found"
    );
  });
});
