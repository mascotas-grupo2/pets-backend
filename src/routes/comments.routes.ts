import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { listPendingComments } from "../controllers/comments.controller.js";

export const commentsRouter = Router();

// Cola global de comentarios pendientes (moderación centralizada del admin).
commentsRouter.get("/pending", requireAdmin, listPendingComments);
