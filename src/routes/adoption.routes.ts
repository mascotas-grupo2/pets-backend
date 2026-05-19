import { Router } from "express";
import { createAdoption, listAdoptions } from "../controllers/adoption.controller.js";
import { requireAuth } from "../lib/auth.js";

export const adoptionRouter = Router();

adoptionRouter.post("/", requireAuth, createAdoption);
adoptionRouter.get("/", requireAuth, listAdoptions);
