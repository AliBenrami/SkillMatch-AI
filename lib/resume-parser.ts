import mammoth from "mammoth";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

PDFParse.setWorker(pathToFileURL(path.join(process.cwd(), "node_modules/pdf-parse/dist/worker/pdf.worker.mjs")).href);

function cleanExtractedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n--\s+\d+\s+of\s+\d+\s+--\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextFromPdfBytes(bytes: Uint8Array) {
  const parser = new PDFParse({ data: Buffer.from(bytes) });

  try {
    const result = await parser.getText();
    const text = cleanExtractedText(result.text);

    if (!text) {
      throw new Error("No readable text was found in the PDF resume.");
    }

    return text;
  } finally {
    await parser.destroy();
  }
}

export async function extractResumeText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return { text: await extractTextFromPdfBytes(bytes), bytes };
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: cleanExtractedText(result.value), bytes };
  }

  if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
    return { text: cleanExtractedText(Buffer.from(bytes).toString("utf8")), bytes };
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT resumes.");
}
