import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getStorageConfig } from "./env";

type StoredObject = {
  key: string;
  url: string;
  provider: "r2" | "local";
};

const localObjects = new Map<string, Uint8Array>();

function getR2Client() {
  const config = getStorageConfig();

  if (config.provider !== "r2") {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
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
  const storageConfig = getStorageConfig();

  if (client && storageConfig.provider === "r2") {
    await client.send(
      new PutObjectCommand({
        Bucket: storageConfig.bucket,
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
      url: storageConfig.publicBaseUrl
        ? `${storageConfig.publicBaseUrl.replace(/\/$/, "")}/${key}`
        : `r2://${storageConfig.bucket}/${key}`
    };
  }

  localObjects.set(key, input.bytes);
  return { key, provider: "local", url: `local://${key}` };
}
