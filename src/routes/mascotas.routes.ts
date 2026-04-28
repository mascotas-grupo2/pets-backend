import { Router } from "express";
import multer from "multer";
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

const upload = multer({ storage: multer.memoryStorage() });

mascotasRouter.get("/", listMascotas);
mascotasRouter.get("/userPetsById", listMascotasByUser);
mascotasRouter.get("/user/:id", listMascotasByUser);
mascotasRouter.post("/petsByIds", listMascotasByIds);
mascotasRouter.get("/:id", getMascota);
mascotasRouter.post("/", upload.single("photo"), createMascota);
mascotasRouter.put("/:id", updateMascota);
mascotasRouter.delete("/:id", deleteMascota);
