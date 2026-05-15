import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  createMascota,
  deleteMascota,
  getMascota,
  listMascotasByIds,
  listMascotasByUser,
  listMascotas,
  updateMascota,
} from "../controllers/mascotas.controller.js";
import { optionalAuth, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();


mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/userPetsById", requireAuth, listMascotasByUser);
mascotasRouter.get("/user/:id", requireAuth, listMascotasByUser);
mascotasRouter.post("/petsByIds", listMascotasByIds);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", optionalAuth, multiple("photo", 6), multerErrorHandler, createMascota);
mascotasRouter.put("/:id", updateMascota);
mascotasRouter.delete("/:id", deleteMascota);
