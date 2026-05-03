import { NextResponse } from "next/server";
import { canAccess, getSessionUser } from "@/lib/auth";
import { getCandidateResumeById } from "@/lib/db";
import { getResumeObject } from "@/lib/storage";

function contentTypeForResumeFile(fileName: string) {
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
  return null;
}

function safeAttachmentName(fileName: string) {
  const trimmed = fileName.trim() || "resume";
  return trimmed.replace(/[\r\n"]/g, "_");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!canAccess(user, "recruiter")) {
    return NextResponse.json({ error: "Authentication required." }, { status: user ? 403 : 401 });
  }

  const { id } = await params;

  const meta = await getCandidateResumeById(id);
  if (!meta) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const object = await getResumeObject(meta.storageUrl);
  if (!object) {
    return NextResponse.json({ error: "Resume file unavailable." }, { status: 404 });
  }

  const fallbackType = contentTypeForResumeFile(meta.fileName);
  const contentType =
    object.contentType && object.contentType !== "application/octet-stream"
      ? object.contentType
      : (fallbackType ?? "application/octet-stream");

  const attachmentName = safeAttachmentName(meta.fileName);

  return new NextResponse(Buffer.from(object.bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${attachmentName}"`
    }
  });
}
