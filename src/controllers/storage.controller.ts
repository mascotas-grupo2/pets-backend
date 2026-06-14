import { Request, Response } from "express";
import minioClient from "../lib/minio.js";

function contentTypeForObject(objectName: string) {
  const lower = objectName.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".jfif")
  )
    return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

const ALLOWED_BUCKETS = new Set(
  [
    process.env.MINIO_BUCKET ?? "report-images",
    process.env.MINIO_PROFILE_BUCKET ?? "profile",
    process.env.MINIO_MESSAGE_FILES_BUCKET ?? "message-files",
  ].filter(Boolean),
);

export async function storageProxyHandler(req: Request, res: Response) {
  const { bucket, object } = req.params;

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return res.status(404).json({ error: "Not found" });
  }

  let objectName: string;
  try {
    objectName = decodeURIComponent(object);
  } catch {
    return res.status(400).json({ error: "Objeto inválido" });
  }

  // Bloquear path traversal / claves absolutas en el nombre del objeto.
  if (
    objectName.includes("..") ||
    objectName.startsWith("/") ||
    objectName.includes("\0")
  ) {
    return res.status(400).json({ error: "Objeto inválido" });
  }

  const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT;
  if (minioPublic) {
    try {
      const base = new URL(`${minioPublic.replace(/\/$/, "")}/`);
      const target = new URL(
        `${bucket}/${encodeURIComponent(objectName)}`,
        base,
      );
      if (target.origin !== base.origin) {
        return res.status(400).json({ error: "Destino inválido" });
      }
      // nosemgrep: tainted-redirect-express
      return res.redirect(target.toString());
    } catch {
      return res.status(400).json({ error: "Destino inválido" });
    }
  }

  try {
    const stat = await new Promise<any>((resolve, reject) => {
      (minioClient as any).statObject(
        bucket,
        objectName,
        (err: any, data: any) => {
          if (err) return reject(err);
          resolve(data);
        },
      );
    });
    const metadata = stat?.metaData ?? {};
    res.type(
      metadata["content-type"] ??
        metadata["Content-Type"] ??
        contentTypeForObject(objectName),
    );

    const stream = await new Promise<any>((resolve, reject) => {
      (minioClient as any).getObject(
        bucket,
        objectName,
        (err: any, dataStream: any) => {
          if (err) return reject(err);
          resolve(dataStream);
        },
      );
    });
    stream.pipe(res);
  } catch (e: any) {
    res.status(404).json({ error: "Not found" });
  }
}

export default storageProxyHandler;
