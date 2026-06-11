import { Router } from "express";
import { createFollowup, listFollowups, confirmFollowup, getFollowupById, updateFollowup, completeFollowup } from "../controllers/followup.controller.js";
import { requireAuth, requireAdmin, optionalAuth } from "../lib/auth.js";

export const followupRouter = Router();

followupRouter.post("/", requireAuth, createFollowup);
followupRouter.get("/", optionalAuth, listFollowups);
followupRouter.get("/:id", optionalAuth, getFollowupById);
followupRouter.put("/:id", requireAuth, updateFollowup);
followupRouter.post("/:id/completar", requireAdmin, completeFollowup);
followupRouter.post("/:id/confirmar", requireAdmin, confirmFollowup);
