import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  adminListMascotas,
  adminListMascotasByStatus,
  adminListMascotasPaged,
  approveClaim,
  claimPet,
  renewMascota,
  confirmReturn,
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
  updatePetPhotos,
  approveMascota,
  finalizeMascota,
  resolveMascota,
  rejectMascota,
  entregaDirecta,
  getMascotaCompatibility,
} from "../controllers/mascotas.controller.js";
import { getMetricas, getMapaReportes } from "../controllers/metrics.controller.js";
import {
  listApprovedComments,
  listOwnerComments,
  createComment,
  approveComment,
  rejectComment,
} from "../controllers/comments.controller.js";
import { createSighting, listSightings } from "../controllers/sightings.controller.js";
import { optionalAuth, requireAdmin, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();

mascotasRouter.get("/", optionalAuth, listMascotas);
// Nuevo endpoint para métricas administrativas
mascotasRouter.get("/admin/metricas", requireAdmin, getMetricas);
mascotasRouter.get("/admin/mapa", requireAdmin, getMapaReportes);
mascotasRouter.get("/admin/list", requireAdmin, adminListMascotas);
mascotasRouter.get("/admin/paged", requireAdmin, adminListMascotasPaged);
mascotasRouter.get("/admin/status/:status", requireAdmin, adminListMascotasByStatus);
mascotasRouter.get("/animal-types", listAnimalTypeCatalog);
mascotasRouter.get("/userPetsById", requireAuth, listMascotasByUser);
mascotasRouter.get("/user/:id", requireAuth, listMascotasByUser);
mascotasRouter.post("/petsByIds", optionalAuth, listMascotasByIds);
mascotasRouter.get("/:id", optionalAuth, getMascota);
mascotasRouter.post("/", optionalAuth, multiple("photo", 6), multerErrorHandler, createMascota);
mascotasRouter.put("/:id", requireAuth, updateMascota);
mascotasRouter.put("/:id/photos", requireAuth, multiple("photo", 6), multerErrorHandler, updatePetPhotos);
mascotasRouter.delete("/:id", requireAuth, deleteMascota);
mascotasRouter.post("/:id/approve", requireAdmin, approveMascota);
mascotasRouter.post("/:id/finalize", requireAdmin, finalizeMascota);
mascotasRouter.post("/:id/resolve", requireAuth, resolveMascota);
mascotasRouter.post("/:id/entrega-directa", requireAdmin, entregaDirecta);
mascotasRouter.post("/:id/reject", requireAdmin, rejectMascota);

// Reclamo de mascota (público) y aprobación / confirmación (solo admin).
mascotasRouter.post("/:id/claim", optionalAuth, multiple("photo", 5), multerErrorHandler, claimPet);
mascotasRouter.post("/:id/renew", requireAuth, renewMascota);
mascotasRouter.post("/:id/approve-claim", requireAdmin, approveClaim);
mascotasRouter.post("/:id/confirm-return", requireAdmin, confirmReturn);
mascotasRouter.get("/:id/notes", requireAdmin, listPetNotes);
mascotasRouter.post("/:id/notes", requireAdmin, createPetNote);

// Compatibilidad usuario↔mascota (detalle público).
mascotasRouter.get("/:id/compatibility", requireAuth, getMascotaCompatibility);

// Comentarios públicos moderados por el dueño.
mascotasRouter.get("/:id/comments", optionalAuth, listApprovedComments);
mascotasRouter.get("/:id/comments/admin", requireAuth, listOwnerComments);
mascotasRouter.post("/:id/comments", optionalAuth, createComment);
mascotasRouter.post("/:id/comments/:commentId/approve", requireAuth, approveComment);
mascotasRouter.post("/:id/comments/:commentId/reject", requireAuth, rejectComment);

// Avistamientos ("La vi").
mascotasRouter.post("/:id/sightings", optionalAuth, createSighting);
mascotasRouter.get("/:id/sightings", requireAuth, listSightings);
