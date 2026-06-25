import { Client } from "minio";

function parseEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return {
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      useSSL: url.protocol === "https:",
    };
  } catch (e) {
    // fallback: endpoint like 'minio:9000' or 'localhost:9000'
    const parts = endpoint.replace(/^https?:\/\//, "").split(":");
    return {
      host: parts[0],
      port: Number(parts[1]) || 9000,
      useSSL: false,
    };
  }
}

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? "minioadmin";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? "minioadmin";
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
const { host, port, useSSL } = parseEndpoint(MINIO_ENDPOINT);

// Tamaño máximo por archivo (bytes). Por defecto 5MB, puede sobrescribirse con MINIO_MAX_FILE_BYTES
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_BYTES = Number(process.env.MINIO_MAX_FILE_BYTES ?? DEFAULT_MAX_FILE_BYTES);

const client = new Client({
  endPoint: host,
  port,
  useSSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

function createClient(endpoint: string) {
  const parsed = parseEndpoint(endpoint);
  return new Client({
    endPoint: parsed.host,
    port: parsed.port,
    useSSL: parsed.useSSL,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
  });
}

function getFallbackEndpoint() {
  if (process.env.MINIO_PUBLIC_ENDPOINT) return process.env.MINIO_PUBLIC_ENDPOINT;
  return host === "minio" ? "http://localhost:9000" : null;
}

function getBackendPublicUrl() {
  const url = (!IS_DEVELOPMENT && process.env.FRONTEND_URL) || `http://localhost:${process.env.PORT || 3001}`;
  return url.replace(/\/$/, "");
}

function getStorageUrl(bucket: string, objectName: string) {
  return `${getBackendPublicUrl()}/api/storage/${bucket}/${encodeURIComponent(objectName)}`;
}

function extensionFromContentType(contentType?: string) {
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/svg+xml") return ".svg";
  return "";
}

function sanitizeObjectName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function parseDataUrlImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function ensureBucketPublic(bucket: string, targetClient = client) {
  try {
    const exists = await targetClient.bucketExists(bucket);
    if (!exists) {
      await targetClient.makeBucket(bucket);
      
      const policy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      });

      // Solo aplicamos la política si el bucket acaba de ser creado
      try {
        // @ts-ignore
        if (typeof (targetClient as any).setBucketPolicy === "function") {
          await (targetClient as any).setBucketPolicy(bucket, policy);
        }
      } catch (e) {
        console.warn("No se pudo establecer política pública en bucket:", e);
      }
    }
  } catch (e: any) {
    if (e?.code === "ENOTFOUND") throw e;
    console.warn("ensureBucketPublic fallo:", e);
  }
}

export async function uploadBufferToMinio(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType?: string
) {
  if (!bucket) throw new Error("MINIO bucket not specified");

  // Validación de tamaño: rechazar archivos mayores al límite configurado
  if (buffer && buffer.length > MAX_FILE_BYTES) {
    const err = new Error(`File too large: ${buffer.length} bytes (max ${MAX_FILE_BYTES})`);
    (err as any).code = "LIMIT_FILE_SIZE";
    throw err;
  }

  async function uploadWith(targetClient: Client) {
    await ensureBucketPublic(bucket, targetClient);
    await targetClient.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": contentType ?? "application/octet-stream",
    } as any);
  }

  try {
    await uploadWith(client);
  } catch (err: any) {
    const fallbackEndpoint = getFallbackEndpoint();
    if (err?.code === "ENOTFOUND" && fallbackEndpoint && fallbackEndpoint !== MINIO_ENDPOINT) {
      await uploadWith(createClient(fallbackEndpoint));
    } else {
      throw err;
    }
  }

  return getStorageUrl(bucket, objectName);
}

export function generateUniqueObjectName(folder: string, originalName?: string, contentType?: string) {
  // Prefer the `report-{timestamp}-{rand}` naming convention to keep files uniform
  const timestamp = Date.now();
  const rand = Math.floor(Math.random() * 10000);
  // try to preserve extension from originalName, otherwise infer from contentType
  let ext = "";
  if (originalName) {
    const m = originalName.match(/(\.[a-z0-9]+)$/i);
    if (m) ext = m[1].toLowerCase();
  }
  if (!ext) {
    ext = extensionFromContentType(contentType) || "";
  }
  const filename = `report-${timestamp}-${rand}${ext}`;
  if (folder) return `${folder.replace(/\/$/, "")}/${filename}`;
  return filename;
}

export async function uploadFileToMinio(
  bucket: string,
  folder: string,
  originalName: string | undefined,
  buffer: Buffer,
  contentType?: string
) {
  const objectName = generateUniqueObjectName(folder, originalName, contentType);
  return uploadBufferToMinio(bucket, objectName, buffer, contentType);
}

export async function uploadDataUrlToMinio(
  bucket: string,
  dataUrl: string,
  objectPrefix = "report"
) {
  const parsed = parseDataUrlImage(dataUrl);
  if (!parsed) return null;

  const objectName = `${objectPrefix}-${Date.now()}${extensionFromContentType(parsed.contentType)}`;
  return uploadBufferToMinio(bucket, objectName, parsed.buffer, parsed.contentType);
}

export async function uploadSeedImageToMinio(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType: string
) {
  return uploadBufferToMinio(
    bucket,
    sanitizeObjectName(objectName),
    buffer,
    contentType
  );
}

export async function createFolderInBucket(bucket: string, folderName: string) {
  if (!bucket) throw new Error("MINIO bucket not specified");
  const objectName = `${folderName}/.keep`;
  const buffer = Buffer.from("");

  async function putWith(targetClient: Client) {
    await ensureBucketPublic(bucket, targetClient);
    await targetClient.putObject(bucket, objectName, buffer, 0);
  }

  try {
    await putWith(client);
  } catch (err: any) {
    const fallbackEndpoint = getFallbackEndpoint();
    if (err?.code === "ENOTFOUND" && fallbackEndpoint && fallbackEndpoint !== MINIO_ENDPOINT) {
      await putWith(createClient(fallbackEndpoint));
    } else {
      // no bloquear la operación si falla la creación del placeholder
      console.warn("No se pudo crear carpeta en bucket:", err);
    }
  }
}

export default client;
