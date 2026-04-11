import cors from "cors";
import express from "express";
import { petsRouter } from "./routes/pets.routes.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/pets", petsRouter);
