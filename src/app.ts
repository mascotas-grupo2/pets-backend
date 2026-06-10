import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { mascotasRouter } from "./routes/mascotas.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { adoptionRouter } from "./routes/adoption.routes.js";
import { chatbotRouter } from "./routes/chatbot.routes.js";
import { followupRouter } from "./routes/followup.routes.js";
import { messageRouter } from "./routes/message.routes.js";
import {
  createMascota,
  listAnimalTypeCatalog,
  listCatalogValueCatalog,
} from "./controllers/mascotas.controller.js";
import storageProxyHandler from "./controllers/storage.controller.js";
import { multiple, multerErrorHandler } from "./middleware/upload.js";
import { submitAdoption } from "./controllers/user.controller.js";
import { optionalAuth, requireAuth } from "./lib/auth.js";

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cookieParser());
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
app.get("/api/animal-types", listAnimalTypeCatalog);
app.get("/api/catalog-values", listCatalogValueCatalog);
app.get("/api/catalog-values/:catalog", listCatalogValueCatalog);
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/users", userRouter);
app.use("/api/adoptions", adoptionRouter);
app.use("/api/chatbot", chatbotRouter);
app.use("/api/followups", followupRouter);
app.use("/api/messages", messageRouter);
app.post("/api/pet/reportar", optionalAuth, multiple("photo", 10), multerErrorHandler, createMascota);
app.post("/api/pet/adoptar", requireAuth, submitAdoption);
// Proxy para servir objetos desde MinIO sin exponer el bucket directamente.
app.get("/api/storage/:bucket/:object", storageProxyHandler);
