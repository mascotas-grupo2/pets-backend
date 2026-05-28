import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  adminListMascotas,
  createMascota,
  createPetNote,
  deleteMascota,
  getMascota,
  listAnimalTypeCatalog,
  listMascotasByIds,
  listMascotasByUser,
  listMascotas,
  listPetNotes,
  updateMascota,
  approveMascota,
  finalizeMascota,
  rejectMascota,
} from "../controllers/mascotas.controller.js";
import { optionalAuth, requireAdmin, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();


mascotasRouter.get("/", optionalAuth, listMascotas);
mascotasRouter.get("/admin/list", requireAdmin, adminListMascotas);
mascotasRouter.get("/animal-types", listAnimalTypeCatalog);
mascotasRouter.get("/userPetsById", requireAuth, listMascotasByUser);
mascotasRouter.get("/user/:id", requireAuth, listMascotasByUser);
mascotasRouter.post("/petsByIds", listMascotasByIds);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", optionalAuth, multiple("photo", 6), multerErrorHandler, createMascota);
mascotasRouter.put("/:id", requireAuth, updateMascota);
mascotasRouter.delete("/:id", requireAdmin, deleteMascota);
mascotasRouter.post("/:id/approve", requireAdmin, approveMascota);
mascotasRouter.post("/:id/finalize", requireAdmin, finalizeMascota);
mascotasRouter.post("/:id/reject", requireAdmin, rejectMascota);
mascotasRouter.get("/:id/notes", requireAdmin, listPetNotes);
mascotasRouter.post("/:id/notes", requireAdmin, createPetNote);
