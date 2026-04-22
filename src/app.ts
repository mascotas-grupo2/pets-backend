import cors from "cors";
import express from "express";
import { mascotasRouter } from "./routes/mascotas.routes.js";
import { authRouter } from "./routes/auth.routes.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/mascotas", mascotasRouter);
app.use("/api/auth", authRouter);
