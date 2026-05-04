import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const wantsInlineView =
    new URL(request.url).searchParams.get("view") === "1" ||
    new URL(request.url).searchParams.get("inline") === "1";

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
  const disposition =
    wantsInlineView && contentType === "application/pdf"
      ? `inline; filename="${attachmentName}"`
      : `attachment; filename="${attachmentName}"`;

  return new NextResponse(Buffer.from(object.bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition
    }
  });
}
