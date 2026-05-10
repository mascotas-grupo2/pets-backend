import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { petCreateSchema, petUpdateSchema } from "../schemas/mascota.schema.js";
import { uploadBufferToMinio, uploadDataUrlToMinio } from "../lib/minio.js";
import { geocodificarDireccion } from "../lib/geocoding.js";

function repo() {
  return AppDataSource.getRepository(Pet);
}

function userRepo() {
  return AppDataSource.getRepository(User);
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
  let data = { ...parsed.data };
  // si llegó un archivo (multer, memoryStorage) lo subimos a MinIO y colocamos la URL en photo
  const file = (req as any).file as Express.Multer.File | undefined;
  if (file) {
    try {
      const bucket = process.env.MINIO_BUCKET ?? "report-images";
      const uniqueName = `${Date.now()}-${file.originalname}`;
      data.photo = await uploadBufferToMinio(bucket, uniqueName, file.buffer, file.mimetype);
    } catch (e) {
      console.error("Error subiendo a MinIO:", e);
      return res.status(500).json({ error: "Error subiendo imagen" });
    }
  }
  if (typeof data.photo === "string" && data.photo.startsWith("data:image/")) {
    try {
      const bucket = process.env.MINIO_BUCKET ?? "report-images";
      data.photo = await uploadDataUrlToMinio(bucket, data.photo, "report");
    } catch (e) {
      console.error("Error subiendo data URL a MinIO:", e);
      return res.status(500).json({ error: "Error subiendo imagen" });
    }
  }

  const coords = await resolverCoordenadas(data.location);
  const { id: _id, createdAt: _createdAt, ...petData } = data;
  const userId =
    req.authUser?.id ??
    petData.userId ??
    (await userRepo().findOneBy({ email: petData.contactEmail }))?.id ??
    null;
  const mascota = repo().create({ ...petData, userId, ...coords });
  const saved = await repo().save(mascota);
  res.status(201).json(saved);
}

export async function listMascotasByIds(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.json([]);

  const mascotas = await repo().findBy({ id: In(ids) });
  res.json(mascotas);
}

export async function listMascotasByUser(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const mascotas = await repo().find({
    where: { userId: id },
    order: { createdAt: "DESC" },
  });
  res.json(mascotas);
}

export async function updateMascota(req: Request, res: Response) {
  const id = req.params.id;
  const parsed = petUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  const coords = "location" in parsed.data
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
