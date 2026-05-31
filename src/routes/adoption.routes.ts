import { Router } from "express";
import {
	adminListAdoptionsPaged,
	createAdoption,
	getAdoptionById,
	listAdoptions,
} from "../controllers/adoption.controller.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";

export const adoptionRouter = Router();

adoptionRouter.post("/", requireAuth, createAdoption);
adoptionRouter.get("/", requireAuth, listAdoptions);
adoptionRouter.get("/admin/paged", requireAdmin, adminListAdoptionsPaged);
adoptionRouter.get("/:id", requireAuth, getAdoptionById);
