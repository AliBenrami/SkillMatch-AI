import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

function resolveStoredObjectKey(storageUrl: string, bucket: string) {
  if (storageUrl.startsWith("local://")) {
    return storageUrl.slice("local://".length);
  }

  if (storageUrl.startsWith("r2://")) {
    const withoutScheme = storageUrl.slice("r2://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash === -1) {
      return null;
    }

    const maybeBucket = withoutScheme.slice(0, slash);
    const objectKey = withoutScheme.slice(slash + 1);
    if (!objectKey || maybeBucket !== bucket) {
      return null;
    }

    return objectKey;
  }

  return null;
}

function resolvePublicObjectKey(storageUrl: string, publicBaseUrl: string | undefined) {
  if (!publicBaseUrl) {
    return null;
  }

  const base = publicBaseUrl.replace(/\/$/, "");
  if (!storageUrl.startsWith(`${base}/`)) {
    return null;
  }

  return storageUrl.slice(base.length + 1);
}

export async function getResumeObject(storageUrl: string): Promise<{
  bytes: Uint8Array;
  contentType: string;
} | null> {
  let storageConfig;
  try {
    storageConfig = getStorageConfig();
  } catch {
    return null;
  }

  if (storageConfig.provider === "local") {
    if (!storageUrl.startsWith("local://")) {
      return null;
    }

    const key = storageUrl.slice("local://".length);

    const bytes = localObjects.get(key);
    if (!bytes) {
      return null;
    }

    return { bytes, contentType: "application/octet-stream" };
  }

  const client = getR2Client();
  if (!client) {
    return null;
  }

  const bucket = storageConfig.bucket;
  const keyFromR2 = resolveStoredObjectKey(storageUrl, bucket);
  const keyFromPublic = resolvePublicObjectKey(storageUrl, storageConfig.publicBaseUrl ?? undefined);
  const key = keyFromR2 ?? keyFromPublic;

  if (!key) {
    return null;
  }

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );

    if (!response.Body) {
      return null;
    }

    const bytes = new Uint8Array(await response.Body.transformToByteArray());
    const contentType = response.ContentType?.trim() || "application/octet-stream";

    return { bytes, contentType };
  } catch {
    return null;
  }
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
