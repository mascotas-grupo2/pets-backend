import cors from "cors";
import express from "express";
import { mascotasRouter } from "./routes/mascotas.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { createMascota } from "./controllers/mascotas.controller.js";
import minioClient from "./lib/minio.js";
import { submitAdoption } from "./controllers/user.controller.js";
import { optionalAuth, requireAuth } from "./lib/auth.js";

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? process.env.BASE_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/mascotas", mascotasRouter);
app.use("/api/pets", mascotasRouter);
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/users", userRouter);

app.post("/api/pet/reportar", optionalAuth, createMascota);
app.post("/api/pet/adoptar", requireAuth, submitAdoption);

function contentTypeForObject(objectName: string) {
  const lower = objectName.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".jfif")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

// Proxy para servir objetos desde MinIO sin exponer el bucket directamente.
app.get("/api/storage/:bucket/:object", async (req, res) => {
  const { bucket, object } = req.params;
  const objectName = decodeURIComponent(object);

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
});
