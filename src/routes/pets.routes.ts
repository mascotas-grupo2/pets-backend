import { Router } from "express";
import {
  createPet,
  deletePet,
  getPet,
  listPets,
  updatePet,
} from "../controllers/pets.controller.js";

export const petsRouter = Router();

petsRouter.get("/", listPets);
petsRouter.get("/:id", getPet);
petsRouter.post("/", createPet);
petsRouter.put("/:id", updatePet);
petsRouter.delete("/:id", deletePet);
