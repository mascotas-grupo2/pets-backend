import { Router } from "express";
import {
  createMascota,
  deleteMascota,
  getMascota,
  listMascotas,
  updateMascota,
} from "../controllers/mascotas.controller.js";

export const mascotasRouter = Router();

mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", createMascota);
mascotasRouter.put("/:id", updateMascota);
mascotasRouter.delete("/:id", deleteMascota);
