import { Router } from "express";
import { requireAuth, requireSuperadmin } from "../lib/auth.js";
import {
  createRefugio,
  getMyRefugio,
  listPublicRefugios,
  listRefugios,
  updateRefugio,
} from "../controllers/refugio.controller.js";

export const refugioRouter = Router();

refugioRouter.get("/public", listPublicRefugios);
refugioRouter.get("/mine", requireAuth, getMyRefugio);
refugioRouter.get("/", requireSuperadmin, listRefugios);
refugioRouter.post("/", requireSuperadmin, createRefugio);
refugioRouter.put("/:id", requireSuperadmin, updateRefugio);
