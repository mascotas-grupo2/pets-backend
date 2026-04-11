import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { petCreateSchema, petUpdateSchema } from "../schemas/pet.schema.js";

export async function listPets(_req: Request, res: Response) {
  const pets = await prisma.pet.findMany({ orderBy: { id: "desc" } });
  res.json(pets);
}

export async function getPet(req: Request, res: Response) {
  const id = Number(req.params.id);
  const pet = await prisma.pet.findUnique({ where: { id } });
  if (!pet) return res.status(404).json({ error: "Pet not found" });
  res.json(pet);
}

export async function createPet(req: Request, res: Response) {
  const parsed = petCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const pet = await prisma.pet.create({ data: parsed.data });
  res.status(201).json(pet);
}

export async function updatePet(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = petUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.pet.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Pet not found" });
  const pet = await prisma.pet.update({ where: { id }, data: parsed.data });
  res.json(pet);
}

export async function deletePet(req: Request, res: Response) {
  const id = Number(req.params.id);
  const existing = await prisma.pet.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Pet not found" });
  await prisma.pet.delete({ where: { id } });
  res.status(204).send();
}
