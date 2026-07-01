import { Router } from "express";
import {
	adminListAdoptionsPaged,
	cancelMyAdoption,
	createAdoption,
	getAdoptionById,
	getMyPetCompatibility,
	listAdoptions,
	listMyAdoptions,
	updateAdoptionStatus,
	deleteAdoption,
	getAdoptionEvaluation,
	toggleAdoptionCheck,
	addAdoptionNote,
} from "../controllers/adoption.controller.js";
import { requireRefugioAdmin, requireAuth } from "../lib/auth.js";

export const adoptionRouter = Router();

adoptionRouter.post("/", requireAuth, createAdoption);
adoptionRouter.get("/", requireAuth, listAdoptions);
adoptionRouter.get("/my", requireAuth, listMyAdoptions);
adoptionRouter.get("/match/:petId", requireAuth, getMyPetCompatibility);
adoptionRouter.get("/admin/paged", requireRefugioAdmin, adminListAdoptionsPaged);
adoptionRouter.patch("/:id/cancel", requireAuth, cancelMyAdoption);
adoptionRouter.patch("/:id/status", requireRefugioAdmin, updateAdoptionStatus);
adoptionRouter.get("/:id/evaluation", requireRefugioAdmin, getAdoptionEvaluation);
adoptionRouter.patch("/:id/checks", requireRefugioAdmin, toggleAdoptionCheck);
adoptionRouter.post("/:id/notes", requireRefugioAdmin, addAdoptionNote);
adoptionRouter.delete("/:id", requireRefugioAdmin, deleteAdoption);
adoptionRouter.get("/:id", requireAuth, getAdoptionById);
