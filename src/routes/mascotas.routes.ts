import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  adminListMascotas,
  adminListMascotasByStatus,
  adminListMascotasPaged,
  getAdminPetById,
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
  rejectClaim,
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
import { createSighting, listSightings, acceptSighting } from "../controllers/sightings.controller.js";
import { optionalAuth, requireRefugioAdmin, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();

mascotasRouter.get("/", optionalAuth, listMascotas);
// Nuevo endpoint para métricas administrativas
mascotasRouter.get("/admin/metricas", requireRefugioAdmin, getMetricas);
mascotasRouter.get("/admin/mapa", requireRefugioAdmin, getMapaReportes);
mascotasRouter.get("/admin/list", requireRefugioAdmin, adminListMascotas);
mascotasRouter.get("/admin/paged", requireRefugioAdmin, adminListMascotasPaged);
mascotasRouter.get("/admin/status/:status", requireRefugioAdmin, adminListMascotasByStatus);
mascotasRouter.get("/admin/pet/:id", requireRefugioAdmin, getAdminPetById);
mascotasRouter.get("/animal-types", listAnimalTypeCatalog);
mascotasRouter.get("/userPetsById", requireAuth, listMascotasByUser);
mascotasRouter.get("/user/:id", requireAuth, listMascotasByUser);
mascotasRouter.post("/petsByIds", optionalAuth, listMascotasByIds);
mascotasRouter.get("/:id", optionalAuth, getMascota);
mascotasRouter.post("/", optionalAuth, multiple("photo", 6), multerErrorHandler, createMascota);
mascotasRouter.put("/:id", requireAuth, updateMascota);
mascotasRouter.put("/:id/photos", requireAuth, multiple("photo", 6), multerErrorHandler, updatePetPhotos);
mascotasRouter.delete("/:id", requireAuth, deleteMascota);
mascotasRouter.post("/:id/approve", requireRefugioAdmin, approveMascota);
mascotasRouter.post("/:id/finalize", requireRefugioAdmin, finalizeMascota);
mascotasRouter.post("/:id/resolve", requireAuth, resolveMascota);
mascotasRouter.post("/:id/entrega-directa", requireRefugioAdmin, entregaDirecta);
mascotasRouter.post("/:id/reject", requireRefugioAdmin, rejectMascota);

// Reclamo de mascota (público) y aprobación / confirmación (solo admin).
mascotasRouter.post("/:id/claim", optionalAuth, multiple("photo", 5), multerErrorHandler, claimPet);
mascotasRouter.post("/:id/renew", requireAuth, renewMascota);
mascotasRouter.post("/:id/approve-claim", requireRefugioAdmin, approveClaim);
mascotasRouter.post("/:id/reject-claim", requireRefugioAdmin, rejectClaim);
mascotasRouter.post("/:id/confirm-return", requireRefugioAdmin, confirmReturn);
mascotasRouter.get("/:id/notes", requireRefugioAdmin, listPetNotes);
mascotasRouter.post("/:id/notes", requireRefugioAdmin, createPetNote);

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
mascotasRouter.post("/:id/sightings/:sightingId/accept", requireAuth, acceptSighting);
