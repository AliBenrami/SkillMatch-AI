export const resumeUploadConfig = {
  acceptedFileTypes: ["PDF", "DOCX", "TXT", "ZIP"],
  acceptedExtensions: [".pdf", ".docx", ".txt", ".zip"],
  maxResumeFileSizeBytes: 8 * 1024 * 1024,
  maxResumeFileSizeLabel: "8 MB",
  maxBatchResumeCount: 12,
  maxRawZipUploadCount: 4,
  maxZipFileSizeBytes: 25 * 1024 * 1024,
  maxZipFileSizeLabel: "25 MB",
} as const;
