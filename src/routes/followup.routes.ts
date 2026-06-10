import { Router } from "express";
import { createFollowup, listFollowups, changeFollowupStatus } from "../controllers/followup.controller.js";
import { requireAuth, requireAdmin, optionalAuth } from "../lib/auth.js";

export const followupRouter = Router();

followupRouter.post("/", requireAuth, createFollowup);
followupRouter.get("/", optionalAuth, listFollowups);
followupRouter.post("/:id/status", requireAdmin, changeFollowupStatus);
