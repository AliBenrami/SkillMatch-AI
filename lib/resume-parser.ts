import mammoth from "mammoth";
import { inflateSync } from "node:zlib";

function decodePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePdfHex(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return Buffer.from(normalized, "hex").toString("latin1");
}

function decodePdfTextToken(value: string) {
  if (value.startsWith("(") && value.endsWith(")")) {
    return decodePdfString(value.slice(1, -1));
  }

  if (value.startsWith("<") && value.endsWith(">")) {
    return decodePdfHex(value.slice(1, -1));
  }

  return "";
}

function extractTextFromPdfBytes(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const source = buffer.toString("latin1");
  const streamPattern =
    /<<(?:[^<>]|<(?!<)|>(?!>))*\/Length[\s\S]*?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  const chunks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = streamPattern.exec(source))) {
    const rawStream = Buffer.from(match[1], "latin1");
    let streamText = "";

    try {
      streamText = inflateSync(rawStream).toString("latin1");
    } catch {
      streamText = rawStream.toString("latin1");
    }

    const textMatches = streamText.matchAll(/(\([^()]*(?:\\.[^()]*)*\)|<[0-9A-Fa-f\s]+>)\s*T[jJ]/g);
    for (const textMatch of textMatches) {
      chunks.push(decodePdfTextToken(textMatch[1]));
    }

    const arrayTextMatches = streamText.matchAll(
      /\[((?:\s*(?:\([^()]*(?:\\.[^()]*)*\)|<[0-9A-Fa-f\s]+>|-?\d+\.?\d*)\s*)+)\]\s*TJ/g
    );
    for (const arrayMatch of arrayTextMatches) {
      const parts = Array.from(
        arrayMatch[1].matchAll(/\([^()]*(?:\\.[^()]*)*\)|<[0-9A-Fa-f\s]+>/g)
      ).map((item) =>
        decodePdfTextToken(item[0])
      );
      chunks.push(parts.join(""));
    }
  }

  return chunks.join("\n").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractResumeText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    return { text: extractTextFromPdfBytes(bytes), bytes };
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: result.value.trim(), bytes };
  }

  if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
    return { text: Buffer.from(bytes).toString("utf8").trim(), bytes };
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, or TXT resumes.");
}
