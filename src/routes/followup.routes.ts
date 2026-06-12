import { Router } from "express";
import {
  createFollowup,
  listFollowups,
  confirmFollowup,
  getFollowupById,
  updateFollowup,
  completeFollowup,
  deleteFollowup,
} from "../controllers/followup.controller.js";
import { requireAdmin } from "../lib/auth.js";

export const followupRouter = Router();

// Los seguimientos son una herramienta exclusiva del admin: todo requireAdmin.
// (Antes POST/PUT eran requireAuth y aceptaban userId/petId del body → IDOR.)
followupRouter.post("/", requireAdmin, createFollowup);
followupRouter.get("/", requireAdmin, listFollowups);
followupRouter.get("/:id", requireAdmin, getFollowupById);
followupRouter.put("/:id", requireAdmin, updateFollowup);
followupRouter.post("/:id/completar", requireAdmin, completeFollowup);
followupRouter.post("/:id/confirmar", requireAdmin, confirmFollowup);
followupRouter.delete("/:id", requireAdmin, deleteFollowup);
