import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { PetNote, PetNoteKind } from "../entity/PetNote.js";
import { User } from "../entity/User.js";
import {
  petCreateSchema,
  petNoteCreateSchema,
  petUpdateSchema,
} from "../schemas/mascota.schema.js";
import { uploadBufferToMinio, uploadDataUrlToMinio, createFolderInBucket, uploadFileToMinio } from "../lib/minio.js";
import { geocodificarDireccion } from "../lib/geocoding.js";

function repo() {
  return AppDataSource.getRepository(Pet);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function noteRepo() {
  return AppDataSource.getRepository(PetNote);
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

export async function adminListMascotas(_req: Request, res: Response) {
  const mascotas = await repo().find({ order: { createdAt: "DESC" } });
  if (mascotas.length === 0) return res.json([]);

  const ids = mascotas.map((m) => m.id);
  const summary = await noteRepo()
    .createQueryBuilder("note")
    .select("note.petId", "petId")
    .addSelect("note.kind", "kind")
    .addSelect("COUNT(*)", "count")
    .addSelect("MAX(note.createdAt)", "lastAt")
    .where("note.petId IN (:...ids)", { ids })
    .groupBy("note.petId")
    .addGroupBy("note.kind")
    .getRawMany<{ petId: string; kind: PetNoteKind; count: string; lastAt: Date }>();

  const byPet = new Map<
    string,
    { adoption: number; medical: number; general: number; lastNoteAt: Date | null }
  >();
  for (const id of ids) {
    byPet.set(id, { adoption: 0, medical: 0, general: 0, lastNoteAt: null });
  }
  for (const row of summary) {
    const acc = byPet.get(row.petId)!;
    const n = Number(row.count);
    if (row.kind === PetNoteKind.ADOPCION) acc.adoption = n;
    else if (row.kind === PetNoteKind.MEDICA) acc.medical = n;
    else acc.general = n;
    if (!acc.lastNoteAt || row.lastAt > acc.lastNoteAt) {
      acc.lastNoteAt = row.lastAt;
    }
  }

  res.json(
    mascotas.map((m) => {
      const s = byPet.get(m.id)!;
      return {
        ...m,
        adoptionInterestCount: s.adoption,
        medicalNoteCount: s.medical,
        generalNoteCount: s.general,
        lastNoteAt: s.lastNoteAt,
      };
    }),
  );
}

export async function getMascota(req: Request, res: Response) {
  const id = req.params.id;
  const mascota = await repo().findOneBy({ id });
  if (!mascota) return res.status(404).json({ error: "Pet no encontrada" });
  res.json(mascota);
}

export async function createMascota(req: Request, res: Response) {
  // Si el request viene como multipart/form-data (FormData), los valores
  // en req.body llegarán como strings. Coercemos tipos antes de validar.
  let bodyForValidation: any = { ...(req.body ?? {}) };
  const contentType = (req.headers["content-type"] ?? "") as string;
  if (contentType.includes("multipart/form-data")) {
    // campos numéricos
    const maybeNumber = (v: any) => (v === undefined || v === null || v === "" ? undefined : Number(v));
    bodyForValidation = {
      ...bodyForValidation,
      ageMonths: maybeNumber(bodyForValidation.ageMonths),
      weightKg: maybeNumber(bodyForValidation.weightKg),
      heightCm: maybeNumber(bodyForValidation.heightCm),
      userId: maybeNumber(bodyForValidation.userId),
    };

    // campos booleanos enviados como "true"/"false"
    const booleanFields = [
      "hasCollar",
      "hasTag",
      "microchipped",
      "neutered",
      "vaccinated",
      "friendlyWithKids",
      "trained",
    ];
    for (const f of booleanFields) {
      if (bodyForValidation[f] === "true") bodyForValidation[f] = true;
      else if (bodyForValidation[f] === "false") bodyForValidation[f] = false;
    }

    // Si photos fue enviada como múltiples entradas, Type of req.body.photos
    // puede ser string or array of strings — dejamos tal cual para la validación
  }

  const parsed = petCreateSchema.safeParse(bodyForValidation);
  if (!parsed.success) {
    // Log minimal debug info to help diagnose multipart/FormData issues
    try {
      console.warn("createMascota: validation failed. content-type=", req.headers["content-type"]);
      console.warn("createMascota: files count=", Array.isArray((req as any).files) ? (req as any).files.length : 0);
      console.warn("createMascota: body keys=", Object.keys(bodyForValidation));
    } catch (e) {
      /* ignore logging failures */
    }
    return res.status(400).json({ error: parsed.error.flatten(), debug: { bodyKeys: Object.keys(bodyForValidation), files: Array.isArray((req as any).files) ? (req as any).files.length : 0 } });
  }
  let data = { ...parsed.data };
  // No subimos aún; creamos el registro primero para obtener el id del reporte

  const coords = await resolverCoordenadas(data.location);
  const { id: _id, createdAt: _createdAt, ...petData } = data;
  const userId =
    req.authUser?.id ??
    petData.userId ??
    (await userRepo().findOneBy({ email: petData.contactEmail }))?.id ??
    null;
  const mascota = repo().create({ ...petData, userId, ...coords });
  const saved = await repo().save(mascota);

  // ahora procesamos imágenes (si las hay) y las subimos dentro de una "carpeta" con el id del reporte
  const bucket = process.env.MINIO_BUCKET ?? "report-images";
  try {
    await createFolderInBucket(bucket, saved.id);
  } catch (e) {
    console.warn("No se pudo crear carpeta de reporte en MinIO:", e);
  }

  const uploadedUrls: string[] = [];

  // archivos subidos por multer: req.files (array)
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    for (const f of files) {
      try {
        const url = await uploadFileToMinio(bucket, String(saved.id), f.originalname, f.buffer, f.mimetype);
        uploadedUrls.push(url);
      } catch (e: any) {
        console.error("Error subiendo a MinIO:", e);
        if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Archivo demasiado grande. Máximo 5MB." });
        return res.status(500).json({ error: "Error subiendo imagen" });
      }
    }
  }

  // si se envió data URL en data.photo
  if (typeof data.photo === "string" && data.photo.startsWith("data:image/")) {
    try {
      const url = await uploadDataUrlToMinio(bucket, data.photo, `${saved.id}/report`);
      if (url) uploadedUrls.push(url);
    } catch (e: any) {
      console.error("Error subiendo data URL a MinIO:", e);
      if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Imagen codificada demasiado grande. Máximo 5MB." });
      return res.status(500).json({ error: "Error subiendo imagen" });
    }
  }

  // si el body trae photos como array de data URLs o URLs
  if (Array.isArray(data.photos) && data.photos.length > 0) {
    for (const p of data.photos) {
      if (typeof p === "string" && p.startsWith("data:image/")) {
        try {
          const url = await uploadDataUrlToMinio(bucket, p, `${saved.id}/report`);
          if (url) uploadedUrls.push(url);
        } catch (e: any) {
          console.error("Error subiendo data URL a MinIO:", e);
          if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Imagen codificada demasiado grande. Máximo 5MB." });
          return res.status(500).json({ error: "Error subiendo imagen" });
        }
      } else if (typeof p === "string" && (p.startsWith("http://") || p.startsWith("https://"))) {
        // ya es una URL pública, la conservamos
        uploadedUrls.push(p);
      }
    }
  }

  // si no subimos nada pero data.photo es una URL, la usamos
  if (uploadedUrls.length === 0 && typeof data.photo === "string" && (data.photo.startsWith("http://") || data.photo.startsWith("https://"))) {
    uploadedUrls.push(data.photo);
  }

  // actualizamos el registro con las URLs (photo = primera, photos = todas)
  const updatePayload: any = {};
  if (uploadedUrls.length > 0) {
    updatePayload.photo = uploadedUrls[0];
    updatePayload.photos = uploadedUrls;
  }

  const updated = await repo().save({ ...saved, ...updatePayload });
  res.status(201).json(updated);
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

  // Solo el admin o el dueño que la publicó pueden editar.
  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";
  const isOwner = existing.userId != null && existing.userId === authUser?.id;
  if (!isAdmin && !isOwner) {
    return res
      .status(403)
      .json({ error: "No tenés permiso para editar esta publicación" });
  }

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

export async function listPetNotes(req: Request, res: Response) {
  const petId = req.params.id;
  const exists = await repo().findOneBy({ id: petId });
  if (!exists) return res.status(404).json({ error: "Pet no encontrada" });
  const notes = await noteRepo().find({
    where: { petId },
    order: { createdAt: "DESC" },
  });
  res.json(notes);
}

export async function createPetNote(req: Request, res: Response) {
  const petId = req.params.id;
  const parsed = petNoteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const pet = await repo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const authorId = req.authUser?.id ?? null;
  let authorName: string | null = null;
  if (authorId) {
    const author = await userRepo().findOneBy({ id: authorId });
    authorName = author?.name ?? author?.email ?? null;
  }

  const note = noteRepo().create({
    petId,
    authorId,
    authorName,
    text: parsed.data.text,
    kind: parsed.data.kind,
  });
  const saved = await noteRepo().save(note);
  res.status(201).json(saved);
}
