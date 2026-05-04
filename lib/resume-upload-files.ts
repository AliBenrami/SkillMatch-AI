import AdmZip from "adm-zip";
import { isAllowedResumeUpload, isAllowedResumeZipUpload } from "./resume-upload-validation";

export type UploadableResumeFile = File & {
  sourceArchive?: string;
};

const zipEntryLimit = 50;
const zipMaxExpandedBytes = 40 * 1024 * 1024;

function mimeTypeForFileName(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function baseFileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

async function expandZipUpload(file: File): Promise<UploadableResumeFile[]> {
  const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const expanded: UploadableResumeFile[] = [];
  let totalBytes = 0;

  if (entries.length > zipEntryLimit) {
    throw new Error(`Zip contains too many files. Include ${zipEntryLimit} files or fewer.`);
  }

  for (const entry of entries) {
    const fileName = baseFileName(entry.entryName);
    if (!isAllowedResumeUpload(fileName, mimeTypeForFileName(fileName))) {
      continue;
    }

    const bytes = new Uint8Array(entry.getData());
    totalBytes += bytes.byteLength;
    if (totalBytes > zipMaxExpandedBytes) {
      throw new Error("Zip expands beyond the 40 MB safety limit.");
    }

    const expandedFile = new File([bytes], fileName, {
      type: mimeTypeForFileName(fileName),
      lastModified: file.lastModified
    }) as UploadableResumeFile;
    expandedFile.sourceArchive = file.name;
    expanded.push(expandedFile);
  }

  return expanded;
}

export async function expandResumeUploads(files: File[]) {
  const expanded: UploadableResumeFile[] = [];
  const failures: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      if (isAllowedResumeZipUpload(file.name, file.type)) {
        const zipFiles = await expandZipUpload(file);
        if (!zipFiles.length) {
          failures.push({ fileName: file.name, error: "Zip did not contain any supported resume files." });
        }
        expanded.push(...zipFiles);
      } else {
        expanded.push(file as UploadableResumeFile);
      }
    } catch (error) {
      failures.push({
        fileName: file.name,
        error: error instanceof Error ? error.message : "Could not read zip archive."
      });
    }
  }

  return { files: expanded, failures };
}
