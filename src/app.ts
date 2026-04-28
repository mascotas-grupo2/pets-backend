import cors from "cors";
import express from "express";
import { mascotasRouter } from "./routes/mascotas.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { createMascota } from "./controllers/mascotas.controller.js";
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
