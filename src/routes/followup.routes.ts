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
import { requireRefugioAdmin } from "../lib/auth.js";

export const followupRouter = Router();

// Los seguimientos son una herramienta exclusiva del admin: todo requireRefugioAdmin.
// (Antes POST/PUT eran requireAuth y aceptaban userId/petId del body → IDOR.)
followupRouter.post("/", requireRefugioAdmin, createFollowup);
followupRouter.get("/", requireRefugioAdmin, listFollowups);
followupRouter.get("/:id", requireRefugioAdmin, getFollowupById);
followupRouter.put("/:id", requireRefugioAdmin, updateFollowup);
followupRouter.post("/:id/completar", requireRefugioAdmin, completeFollowup);
followupRouter.post("/:id/confirmar", requireRefugioAdmin, confirmFollowup);
followupRouter.delete("/:id", requireRefugioAdmin, deleteFollowup);
