import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  adminListMascotas,
  createMascota,
  createPetNote,
  deleteMascota,
  getMascota,
  listMascotasByIds,
  listMascotasByUser,
  listMascotas,
  listPetNotes,
  updateMascota,
} from "../controllers/mascotas.controller.js";
import { optionalAuth, requireAdmin, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();


mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/userPetsById", requireAuth, listMascotasByUser);
mascotasRouter.get("/user/:id", requireAuth, listMascotasByUser);
mascotasRouter.post("/petsByIds", listMascotasByIds);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", optionalAuth, multiple("photo", 6), multerErrorHandler, createMascota);
mascotasRouter.put("/:id", requireAdmin, updateMascota);
mascotasRouter.delete("/:id", requireAdmin, deleteMascota);

mascotasRouter.get("/:id/notes", requireAdmin, listPetNotes);
mascotasRouter.post("/:id/notes", requireAdmin, createPetNote);
