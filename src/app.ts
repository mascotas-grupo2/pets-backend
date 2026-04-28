import cors from "cors";
import express from "express";
import { mascotasRouter } from "./routes/mascotas.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { createMascota } from "./controllers/mascotas.controller.js";
import minioClient from "./lib/minio.js";
import { submitAdoption } from "./controllers/user.controller.js";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/mascotas", mascotasRouter);
app.use("/api/pets", mascotasRouter);
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/users", userRouter);

app.post("/api/pet/reportar", createMascota);
app.post("/api/pet/adoptar", submitAdoption);

// Proxy para servir objetos desde MinIO (evita necesitar bucket público)
app.get("/api/storage/:bucket/:object", async (req, res) => {
  const { bucket, object } = req.params;
  const objectName = decodeURIComponent(object);
  try {
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
