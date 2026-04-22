import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { petCreateSchema, petUpdateSchema } from "../schemas/mascota.schema.js";
import { geocodificarDireccion } from "../lib/geocoding.js";

function repo() {
  return AppDataSource.getRepository(Pet);
}

async function resolverCoordenadas(direccion: string | undefined) {
  if (!direccion) return { latitud: null, longitud: null };
  const coords = await geocodificarDireccion(direccion);
  if (!coords) console.warn(`Sin resultados de geocodificación para: "${direccion}"`);
  return coords ?? { latitud: null, longitud: null };
}

export async function listMascotas(_req: Request, res: Response) {
  const mascotas = await repo().find({ order: { id: "DESC" } });
  res.json(mascotas);
}

export async function getMascota(req: Request, res: Response) {
  const id = req.params.id;
  const mascota = await repo().findOneBy({ id });
  if (!mascota) return res.status(404).json({ error: "Pet no encontrada" });
  res.json(mascota);
}

export async function createMascota(req: Request, res: Response) {
  const parsed = petCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const coords = await resolverCoordenadas(parsed.data.location);
  const mascota = repo().create({ ...parsed.data, ...coords });
  const saved = await repo().save(mascota);
  res.status(201).json(saved);
}

export async function updateMascota(req: Request, res: Response) {
  const id = req.params.id;
  const parsed = petUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  const coords = "direccion" in parsed.data
    ? await resolverCoordenadas(parsed.data.location)
    : {};

  const updated = await repo().save({ ...existing, ...parsed.data, ...coords });
  res.json(updated);
}

export async function deleteMascota(req: Request, res: Response) {
  const id = req.params.id;
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  await repo().remove(existing);
  res.status(204).send();
}
