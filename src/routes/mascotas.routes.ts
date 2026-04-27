import { Router } from "express";
import {
  createMascota,
  deleteMascota,
  getMascota,
  listMascotasByIds,
  listMascotasByUser,
  listMascotas,
  updateMascota,
} from "../controllers/mascotas.controller.js";

export const mascotasRouter = Router();

mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/userPetsById", listMascotasByUser);
mascotasRouter.get("/user/:id", listMascotasByUser);
mascotasRouter.post("/petsByIds", listMascotasByIds);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", createMascota);
mascotasRouter.put("/:id", updateMascota);
mascotasRouter.delete("/:id", deleteMascota);
