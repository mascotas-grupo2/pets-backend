import { Router } from "express";
import {
  createMascota,
  deleteMascota,
  getMascota,
  listMascotas,
  updateMascota,
} from "../controllers/mascotas.controller.js";
import { requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();

// Lectura pública
mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/:id", getMascota);

// Escritura requiere token válido emitido por Keycloak
mascotasRouter.post("/", requireAuth, createMascota);
mascotasRouter.put("/:id", requireAuth, updateMascota);
mascotasRouter.delete("/:id", requireAuth, deleteMascota);
