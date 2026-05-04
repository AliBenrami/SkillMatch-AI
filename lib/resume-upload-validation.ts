const allowedResumeExtensions = /\.(pdf|docx|txt)$/i;

const allowedResumeMime = new Set(
  [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    ""
  ].map((m) => m.toLowerCase())
);

const genericBinaryMime = new Set(["application/octet-stream", "binary/octet-stream"]);

function isContradictoryResumeMime(mimeLower: string) {
  return (
    mimeLower.startsWith("image/") || mimeLower.startsWith("video/") || mimeLower.startsWith("audio/")
  );
}

/** Aligns with lib/resume-parser.ts: extension is authoritative when MIME is missing or generic. */
export function isAllowedResumeUpload(fileName: string, mimeType: string): boolean {
  if (!allowedResumeExtensions.test(fileName)) {
    return false;
  }

  const t = mimeType.trim().toLowerCase();
  if (allowedResumeMime.has(t) || genericBinaryMime.has(t)) {
    return true;
  }

  if (isContradictoryResumeMime(t)) {
    return false;
  }

  return true;
}
