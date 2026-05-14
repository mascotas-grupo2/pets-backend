import { Request, Response } from "express";
import minioClient from "../lib/minio.js";

function contentTypeForObject(objectName: string) {
  const lower = objectName.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jfif")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export async function storageProxyHandler(req: Request, res: Response) {
  const { bucket, object } = req.params;
  const objectName = decodeURIComponent(object);

  // Si existe un endpoint público para MinIO, redirigimos al objeto directamente
  const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT;
  if (minioPublic) {
    const publicUrl = `${minioPublic.replace(/\/$/, "")}/${bucket}/${encodeURIComponent(objectName)}`;
    return res.redirect(publicUrl);
  }

  try {
    const stat = await new Promise<any>((resolve, reject) => {
      (minioClient as any).statObject(bucket, objectName, (err: any, data: any) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
    const metadata = stat?.metaData ?? {};
    res.type(metadata["content-type"] ?? metadata["Content-Type"] ?? contentTypeForObject(objectName));

    const stream = await new Promise<any>((resolve, reject) => {
      (minioClient as any).getObject(bucket, objectName, (err: any, dataStream: any) => {
        if (err) return reject(err);
        resolve(dataStream);
      });
    });
    stream.pipe(res);
  } catch (e: any) {
    res.status(404).json({ error: "Not found" });
  }
}

export default storageProxyHandler;
