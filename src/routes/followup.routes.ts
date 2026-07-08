import { Router } from "express";
import {
  createFollowup,
  listFollowups,
  listMyFollowups,
  confirmFollowup,
  getFollowupById,
  updateFollowup,
  completeFollowup,
  rejectFollowup,
  deleteFollowup,
} from "../controllers/followup.controller.js";
import { requireRefugioAdmin, requireAuth } from "../lib/auth.js";

export const followupRouter = Router();

// El adoptante puede ver SUS propios seguimientos post-adopción (solo lectura).
// Debe ir ANTES de "/:id" para no colisionar con la ruta admin.
followupRouter.get("/mine", requireAuth, listMyFollowups);

// El resto son una herramienta exclusiva del admin: todo requireRefugioAdmin.
// (Antes POST/PUT eran requireAuth y aceptaban userId/petId del body → IDOR.)
followupRouter.post("/", requireRefugioAdmin, createFollowup);
followupRouter.get("/", requireRefugioAdmin, listFollowups);
followupRouter.get("/:id", requireRefugioAdmin, getFollowupById);
followupRouter.put("/:id", requireRefugioAdmin, updateFollowup);
followupRouter.post("/:id/completar", requireRefugioAdmin, completeFollowup);
followupRouter.post("/:id/confirmar", requireRefugioAdmin, confirmFollowup);
followupRouter.post("/:id/rechazar", requireRefugioAdmin, rejectFollowup);
followupRouter.delete("/:id", requireRefugioAdmin, deleteFollowup);
