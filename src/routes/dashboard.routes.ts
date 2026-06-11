import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { getDashboardStats } from "../controllers/dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", requireAdmin, getDashboardStats);
