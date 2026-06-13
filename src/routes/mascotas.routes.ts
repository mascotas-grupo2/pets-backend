import { Router } from "express";
import { multiple, multerErrorHandler } from "../middleware/upload.js";
import {
  adminListMascotas,
  adminListMascotasByStatus,
  adminListMascotasPaged,
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
  entregaDirecta,
} from "../controllers/mascotas.controller.js";
import {
  listComments,
  createComment,
} from "../controllers/comment.controller.js";
import { optionalAuth, requireAdmin, requireAuth } from "../lib/auth.js";

export const mascotasRouter = Router();

mascotasRouter.get("/", optionalAuth, listMascotas);
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
mascotasRouter.delete("/:id", requireAdmin, deleteMascota);
mascotasRouter.post("/:id/approve", requireAdmin, approveMascota);
mascotasRouter.post("/:id/finalize", requireAdmin, finalizeMascota);
mascotasRouter.post("/:id/entrega-directa", requireAdmin, entregaDirecta);
mascotasRouter.post("/:id/reject", requireAdmin, rejectMascota);
mascotasRouter.get("/:id/notes", requireAdmin, listPetNotes);
mascotasRouter.post("/:id/notes", requireAdmin, createPetNote);

// ===== Rutas de comentarios dentro de /api/mascotas/:petId/comments =====
mascotasRouter.get("/:petId/comments", optionalAuth, listComments);
mascotasRouter.get("/:petId/comments/admin", optionalAuth, listComments);
mascotasRouter.post("/:petId/comments", requireAuth, createComment);
mascotasRouter.post("/:petId/comments/:id/approve", requireAuth, async (req, res, next) => {
  try {
    const { approveComment } = await import("../controllers/comment.controller.js");
    req.body = { ...req.body, approved: true };
    await approveComment(req, res);
  } catch (e) { next(e); }
});
mascotasRouter.post("/:petId/comments/:id/reject", requireAuth, async (req, res, next) => {
  try {
    const { approveComment } = await import("../controllers/comment.controller.js");
    req.body = { ...req.body, approved: false };
    await approveComment(req, res);
  } catch (e) { next(e); }
});
