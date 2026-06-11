import { Router } from "express";
import {
	adminListAdoptionsPaged,
	createAdoption,
	getAdoptionById,
	listAdoptions,
	updateAdoptionStatus,
	deleteAdoption,
	getAdoptionEvaluation,
	toggleAdoptionCheck,
	addAdoptionNote,
} from "../controllers/adoption.controller.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";

export const adoptionRouter = Router();

adoptionRouter.post("/", requireAuth, createAdoption);
adoptionRouter.get("/", requireAuth, listAdoptions);
adoptionRouter.get("/admin/paged", requireAdmin, adminListAdoptionsPaged);
adoptionRouter.patch("/:id/status", requireAdmin, updateAdoptionStatus);
adoptionRouter.get("/:id/evaluation", requireAdmin, getAdoptionEvaluation);
adoptionRouter.patch("/:id/checks", requireAdmin, toggleAdoptionCheck);
adoptionRouter.post("/:id/notes", requireAdmin, addAdoptionNote);
adoptionRouter.delete("/:id", requireAdmin, deleteAdoption);
adoptionRouter.get("/:id", requireAuth, getAdoptionById);
