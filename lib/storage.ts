import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

type StoredObject = {
  key: string;
  url: string;
  provider: "r2" | "local";
};

const localObjects = new Map<string, Uint8Array>();

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase();
}

export async function storeResumeFile(input: {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<StoredObject> {
  const key = `resumes/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName(
    input.fileName
  )}`;
  const client = getR2Client();

  if (client) {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType,
        ServerSideEncryption: "AES256",
        Metadata: {
          originalFileName: input.fileName
        }
      })
    );

    return {
      key,
      provider: "r2",
      url: process.env.R2_PUBLIC_BASE_URL
        ? `${process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`
        : `r2://${process.env.R2_BUCKET}/${key}`
    };
  }

  localObjects.set(key, input.bytes);
  return { key, provider: "local", url: `local://${key}` };
}
