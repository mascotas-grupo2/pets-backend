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
const { host, port, useSSL } = parseEndpoint(MINIO_ENDPOINT);

const client = new Client({
  endPoint: host,
  port,
  useSSL,
  accessKey: process.env.MINIO_ACCESS_KEY ?? undefined,
  secretKey: process.env.MINIO_SECRET_KEY ?? undefined,
});

async function ensureBucketPublic(bucket: string) {
  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
    }

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

    // setBucketPolicy acepta el nombre del bucket y la política JSON
    // si falla, no evitamos la subida, pero registramos el error
    try {
      // @ts-ignore
      if (typeof (client as any).setBucketPolicy === "function") {
        // some minio client versions expect (bucket, policy)
        await (client as any).setBucketPolicy(bucket, policy);
      }
    } catch (e) {
      console.warn("No se pudo establecer política pública en bucket:", e);
    }
  } catch (e) {
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
  // ensure bucket exists and is public
  await ensureBucketPublic(bucket);

  // putObject supports Buffer
  try {
    await client.putObject(bucket, objectName, buffer, buffer.length, {
      "Content-Type": contentType ?? "application/octet-stream",
    } as any);
  } catch (err: any) {
    // Si falla por DNS (por ejemplo hostname 'minio' no resolvible desde host), intentar con MINIO_PUBLIC_ENDPOINT
    const publicEp = process.env.MINIO_PUBLIC_ENDPOINT;
    if (err && err.code === "ENOTFOUND" && publicEp && publicEp !== MINIO_ENDPOINT) {
      const { host: phost, port: pport, useSSL: pssl } = parseEndpoint(publicEp);
      const alt = new Client({
        endPoint: phost,
        port: pport,
        useSSL: pssl,
        accessKey: process.env.MINIO_ACCESS_KEY ?? undefined,
        secretKey: process.env.MINIO_SECRET_KEY ?? undefined,
      });
      await alt.putObject(bucket, objectName, buffer, buffer.length, {
        "Content-Type": contentType ?? "application/octet-stream",
      } as any);
    } else {
      throw err;
    }
  }

  // Return a presigned URL so clients can access the object even if the bucket is not public.
  const expiresSeconds = Number(process.env.MINIO_PRESIGNED_EXPIRES ?? 60 * 60 * 24 * 7); // default 7 days
  try {
    const presigned = await new Promise<string>((resolve, reject) => {
      try {
        (client as any).presignedGetObject(bucket, objectName, expiresSeconds, (err: any, url: string) => {
          if (err) return reject(err);
          resolve(url);
        });
      } catch (err) {
        reject(err);
      }
    });
    return presigned;
  } catch (e) {
    // If presigned fails (e.g. due to endpoint mismatch), fall back to public endpoint URL
    const publicEndpoint = (process.env.MINIO_PUBLIC_ENDPOINT ?? MINIO_ENDPOINT).replace(/\/$/, "");
    return `${publicEndpoint}/${bucket}/${encodeURIComponent(objectName)}`;
  }
}

export default client;
