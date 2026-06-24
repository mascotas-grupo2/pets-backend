import { Router } from "express";
import { requireRefugioAdmin } from "../lib/auth.js";
import {
  getDashboardStats,
  getDashboardActivity,
} from "../controllers/dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", requireRefugioAdmin, getDashboardStats);
dashboardRouter.get("/activity", requireRefugioAdmin, getDashboardActivity);
