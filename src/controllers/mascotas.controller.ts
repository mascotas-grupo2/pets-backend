import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { User } from "../entity/User.js";
import {
  petCreateSchema,
  petNoteCreateSchema,
  petUpdateSchema,
} from "../schemas/mascota.schema.js";
import {
  uploadBufferToMinio,
  uploadDataUrlToMinio,
  createFolderInBucket,
  uploadFileToMinio,
} from "../lib/minio.js";
import { geocodificarDireccion } from "../lib/geocoding.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  listCatalogValues,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { Catalog, CatalogIds, CatalogName } from "../lib/catalog-constants.js";

function repo() {
  return AppDataSource.getRepository(Pet);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function noteRepo() {
  return AppDataSource.getRepository(PetNote);
}

type CatalogValueMap = Map<number, CatalogValue>;

function catalogInfo(
  catalogValuesById: CatalogValueMap,
  id: number | null | undefined,
) {
  const item = id ? (catalogValuesById.get(id) ?? null) : null;
  return item ? { id: item.id, code: item.code, label: item.label } : null;
}

function serializeMascota(mascota: Pet, catalogValuesById: CatalogValueMap) {
  const animalType = catalogInfo(catalogValuesById, mascota.animalTypeId);
  const sex = catalogInfo(catalogValuesById, mascota.sexId);
  const status = catalogInfo(catalogValuesById, mascota.statusId);
  const reportStatus = catalogInfo(catalogValuesById, mascota.reportStatusId);
  const medicalStatus = catalogInfo(catalogValuesById, mascota.medicalStatusId);
  const payload = { ...(mascota as any) };

  return {
    ...payload,
    animalType: animalType?.code ?? null,
    animalTypeLabel: animalType?.label ?? null,
    animalTypeInfo: animalType,
    sex: sex?.code ?? null,
    sexLabel: sex?.label ?? null,
    sexInfo: sex,
    status: status?.code ?? null,
    statusLabel: status?.label ?? null,
    statusInfo: status,
    medicalStatus: medicalStatus?.code ?? null,
    medicalStatusLabel: medicalStatus?.label ?? null,
    medicalStatusInfo: medicalStatus,
    reportStatus: reportStatus?.code ?? null,
    reportStatusLabel: reportStatus?.label ?? null,
    reportStatusInfo: reportStatus,
  };
}

function serializePetNote(note: PetNote, catalogValuesById: CatalogValueMap) {
  const kind = catalogInfo(catalogValuesById, note.kindId);
  return {
    ...note,
    kind: kind?.code ?? null,
    kindLabel: kind?.label ?? null,
    kindInfo: kind,
  };
}

function handleCatalogError(error: unknown, res: Response) {
  if (error instanceof CatalogValidationError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

async function resolveOptionalCatalogId(
  catalog: CatalogName,
  id: number | null | undefined,
  code: string | number | null | undefined,
) {
  if (id === undefined && code === undefined) return undefined;
  return (await resolveCatalogValueId(catalog, { id, code }, false)) ?? null;
}

async function resolverCoordenadas(direccion: string | undefined) {
  if (!direccion) return { latitud: null, longitud: null };
  const coords = await geocodificarDireccion(direccion);
  if (!coords)
    console.warn(`Sin resultados de geocodificación para: "${direccion}"`);
  return coords ?? { latitud: null, longitud: null };
}

export async function listAnimalTypeCatalog(_req: Request, res: Response) {
  res.json(await listCatalogValues(Catalog.ANIMAL_TYPE));
}

export async function listCatalogValueCatalog(req: Request, res: Response) {
  const catalog = req.params.catalog as CatalogName | undefined;
  if (!catalog) return res.json(await listCatalogValues());
  if (!Object.values(Catalog).includes(catalog)) {
    return res.status(404).json({ error: "Catalogo no encontrado" });
  }
  res.json(await listCatalogValues(catalog));
}

export async function listMascotas(req: Request, res: Response) {
  const userId = req.authUser?.id ?? null;
  const mascotas = await repo().find({
    where: userId
      ? [
          { reportStatusId: CatalogIds.petReportStatus.activo },
          {
            userId,
            reportStatusId: In([
              CatalogIds.petReportStatus.pendiente,
              CatalogIds.petReportStatus.rechazado,
            ]),
          },
        ]
      : { reportStatusId: CatalogIds.petReportStatus.activo },
    order: { id: "DESC" },
  });
  const catalogValuesById = await getCatalogValuesById();
  res.json(
    mascotas.map((mascota) => serializeMascota(mascota, catalogValuesById)),
  );
}

export async function adminListMascotas(_req: Request, res: Response) {
  const mascotas = await repo().find({ order: { createdAt: "DESC" } });
  if (mascotas.length === 0) return res.json([]);
  const catalogValuesById = await getCatalogValuesById();

  const ids = mascotas.map((m) => m.id);
  const summary = await noteRepo()
    .createQueryBuilder("note")
    .select("note.petId", "petId")
    .addSelect("note.kindId", "kindId")
    .addSelect("COUNT(*)", "count")
    .addSelect("MAX(note.createdAt)", "lastAt")
    .where("note.petId IN (:...ids)", { ids })
    .groupBy("note.petId")
    .addGroupBy("note.kindId")
    .getRawMany<{
      petId: string;
      kindId: number;
      count: string;
      lastAt: Date;
    }>();

  const byPet = new Map<
    string,
    {
      adoption: number;
      medical: number;
      general: number;
      lastNoteAt: Date | null;
    }
  >();
  for (const id of ids) {
    byPet.set(id, { adoption: 0, medical: 0, general: 0, lastNoteAt: null });
  }
  for (const row of summary) {
    const acc = byPet.get(row.petId)!;
    const n = Number(row.count);
    if (row.kindId === CatalogIds.petNoteKind.adopcion) acc.adoption = n;
    else if (row.kindId === CatalogIds.petNoteKind.medica) acc.medical = n;
    else acc.general = n;
    if (!acc.lastNoteAt || row.lastAt > acc.lastNoteAt) {
      acc.lastNoteAt = row.lastAt;
    }
  }

  // Datos del creador (usuario registrado) para mostrar quién publicó.
  const userIds = [
    ...new Set(
      mascotas
        .map((m) => m.userId)
        .filter((uid): uid is number => Number.isInteger(uid)),
    ),
  ];
  const owners = userIds.length
    ? await userRepo().find({ where: { id: In(userIds) } })
    : [];
  const ownerById = new Map(owners.map((u) => [u.id, u]));

  res.json(
    mascotas.map((m) => {
      const s = byPet.get(m.id)!;
      const owner = m.userId != null ? ownerById.get(m.userId) : null;
      return {
        ...serializeMascota(m, catalogValuesById),
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
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
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(mascota, catalogValuesById));
}

export async function createMascota(req: Request, res: Response) {
  // Si el request viene como multipart/form-data (FormData), los valores
  // en req.body llegarán como strings. Coercemos tipos antes de validar.
  let bodyForValidation: any = { ...(req.body ?? {}) };
  const contentType = (req.headers["content-type"] ?? "") as string;
  if (contentType.includes("multipart/form-data")) {
    // campos numéricos
    const maybeNumber = (v: any) =>
      v === undefined || v === null || v === "" ? undefined : Number(v);
    bodyForValidation = {
      ...bodyForValidation,
      ageMonths: maybeNumber(bodyForValidation.ageMonths),
      weightKg: maybeNumber(bodyForValidation.weightKg),
      heightCm: maybeNumber(bodyForValidation.heightCm),
      userId: maybeNumber(bodyForValidation.userId),
      animalTypeId: maybeNumber(bodyForValidation.animalTypeId),
      sexId: maybeNumber(bodyForValidation.sexId),
      statusId: maybeNumber(bodyForValidation.statusId),
      medicalStatusId: maybeNumber(bodyForValidation.medicalStatusId),
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
      console.warn(
        "createMascota: validation failed. content-type=",
        req.headers["content-type"],
      );
      console.warn(
        "createMascota: files count=",
        Array.isArray((req as any).files) ? (req as any).files.length : 0,
      );
      console.warn("createMascota: body keys=", Object.keys(bodyForValidation));
    } catch (e) {
      /* ignore logging failures */
    }
    return res.status(400).json({
      error: parsed.error.flatten(),
      debug: {
        bodyKeys: Object.keys(bodyForValidation),
        files: Array.isArray((req as any).files)
          ? (req as any).files.length
          : 0,
      },
    });
  }
  let data = { ...parsed.data };
  let catalogIds: {
    animalTypeId: number;
    sexId: number | null | undefined;
    statusId: number | null | undefined;
    medicalStatusId: number | null | undefined;
  };
  try {
    const animalTypeId = await resolveCatalogValueId(
      Catalog.ANIMAL_TYPE,
      { id: data.animalTypeId, code: data.animalType },
      true,
    );
    if (!animalTypeId)
      return res.status(400).json({ error: "El tipo de animal es requerido" });
    catalogIds = {
      animalTypeId,
      sexId: await resolveOptionalCatalogId(
        Catalog.PET_SEX,
        data.sexId,
        data.sex,
      ),
      statusId: await resolveOptionalCatalogId(
        Catalog.PET_STATUS,
        data.statusId,
        data.status,
      ),
      medicalStatusId: await resolveOptionalCatalogId(
        Catalog.PET_MEDICAL_STATUS,
        data.medicalStatusId,
        data.medicalStatus,
      ),
    };
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }
  // No subimos aún; creamos el registro primero para obtener el id del reporte

  const coords = await resolverCoordenadas(data.location);
  const {
    id: _id,
    createdAt: _createdAt,
    animalType: _animalType,
    animalTypeId: _inputAnimalTypeId,
    sex: _sex,
    sexId: _inputSexId,
    status: _status,
    statusId: _inputStatusId,
    medicalStatus: _medicalStatus,
    medicalStatusId: _inputMedicalStatusId,
    ...petData
  } = data;
  const userId =
    req.authUser?.id ??
    petData.userId ??
    (await userRepo().findOneBy({ email: petData.contactEmail }))?.id ??
    null;
  const mascota = repo().create({
    ...petData,
    animalTypeId: catalogIds.animalTypeId,
    ...(catalogIds.sexId !== undefined ? { sexId: catalogIds.sexId } : {}),
    ...(catalogIds.statusId !== undefined && catalogIds.statusId !== null
      ? { statusId: catalogIds.statusId }
      : {}),
    ...(catalogIds.medicalStatusId !== undefined &&
    catalogIds.medicalStatusId !== null
      ? { medicalStatusId: catalogIds.medicalStatusId }
      : {}),
    userId,
    ...coords,
  });
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
        const url = await uploadFileToMinio(
          bucket,
          String(saved.id),
          f.originalname,
          f.buffer,
          f.mimetype,
        );
        uploadedUrls.push(url);
      } catch (e: any) {
        console.error("Error subiendo a MinIO:", e);
        if (e?.code === "LIMIT_FILE_SIZE")
          return res
            .status(413)
            .json({ error: "Archivo demasiado grande. Máximo 5MB." });
        return res.status(500).json({ error: "Error subiendo imagen" });
      }
    }
  }

  // si se envió data URL en data.photo
  if (typeof data.photo === "string" && data.photo.startsWith("data:image/")) {
    try {
      const url = await uploadDataUrlToMinio(
        bucket,
        data.photo,
        `${saved.id}/report`,
      );
      if (url) uploadedUrls.push(url);
    } catch (e: any) {
      console.error("Error subiendo data URL a MinIO:", e);
      if (e?.code === "LIMIT_FILE_SIZE")
        return res
          .status(413)
          .json({ error: "Imagen codificada demasiado grande. Máximo 5MB." });
      return res.status(500).json({ error: "Error subiendo imagen" });
    }
  }

  // si el body trae photos como array de data URLs o URLs
  if (Array.isArray(data.photos) && data.photos.length > 0) {
    for (const p of data.photos) {
      if (typeof p === "string" && p.startsWith("data:image/")) {
        try {
          const url = await uploadDataUrlToMinio(
            bucket,
            p,
            `${saved.id}/report`,
          );
          if (url) uploadedUrls.push(url);
        } catch (e: any) {
          console.error("Error subiendo data URL a MinIO:", e);
          if (e?.code === "LIMIT_FILE_SIZE")
            return res.status(413).json({
              error: "Imagen codificada demasiado grande. Máximo 5MB.",
            });
          return res.status(500).json({ error: "Error subiendo imagen" });
        }
      } else if (
        typeof p === "string" &&
        (p.startsWith("http://") || p.startsWith("https://"))
      ) {
        // ya es una URL pública, la conservamos
        uploadedUrls.push(p);
      }
    }
  }

  // si no subimos nada pero data.photo es una URL, la usamos
  if (
    uploadedUrls.length === 0 &&
    typeof data.photo === "string" &&
    (data.photo.startsWith("http://") || data.photo.startsWith("https://"))
  ) {
    uploadedUrls.push(data.photo);
  }

  // actualizamos el registro con las URLs (photo = primera, photos = todas)
  const updatePayload: any = {};
  if (uploadedUrls.length > 0) {
    updatePayload.photo = uploadedUrls[0];
    updatePayload.photos = uploadedUrls;
  }

  const updated = await repo().save({ ...saved, ...updatePayload });
  const reloaded = await repo().findOneByOrFail({ id: updated.id });
  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json(serializeMascota(reloaded, catalogValuesById));
}

export async function listMascotasByIds(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.json([]);

  const mascotas = await repo().findBy({ id: In(ids) });
  const catalogValuesById = await getCatalogValuesById();
  res.json(
    mascotas.map((mascota) => serializeMascota(mascota, catalogValuesById)),
  );
}

export async function listMascotasByUser(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const mascotas = await repo().find({
    where: { userId: id },
    order: { createdAt: "DESC" },
  });
  const catalogValuesById = await getCatalogValuesById();
  res.json(
    mascotas.map((mascota) => serializeMascota(mascota, catalogValuesById)),
  );
}

export async function updateMascota(req: Request, res: Response) {
  const id = req.params.id;
  const parsed = petUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  // permiso: admin puede editar cualquier reporte; usuario puede editar solo sus propios reportes
  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";
  if (!isAdmin) {
    if (!authUser || authUser.id !== existing.userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
  }

  let catalogIds:
    | {
        animalTypeId?: number | null;
        sexId?: number | null;
        statusId?: number | null;
        medicalStatusId?: number | null;
        reportStatusId?: number | null;
      }
    | undefined;
  // si no es admin, evitamos que modifique el reportStatus
  const data = { ...(parsed.data as any) };
  if (!isAdmin) {
    delete data.reportStatus;
    delete data.reportStatusId;
  }

  try {
    catalogIds = {
      animalTypeId: await resolveOptionalCatalogId(
        Catalog.ANIMAL_TYPE,
        data.animalTypeId,
        data.animalType,
      ),
      sexId: await resolveOptionalCatalogId(
        Catalog.PET_SEX,
        data.sexId,
        data.sex,
      ),
      statusId: await resolveOptionalCatalogId(
        Catalog.PET_STATUS,
        data.statusId,
        data.status,
      ),
      medicalStatusId: await resolveOptionalCatalogId(
        Catalog.PET_MEDICAL_STATUS,
        data.medicalStatusId,
        data.medicalStatus,
      ),
      // reportStatus only resolved for admins
      ...(isAdmin
        ? {
            reportStatusId: await resolveOptionalCatalogId(
              Catalog.PET_REPORT_STATUS,
              data.reportStatusId,
              data.reportStatus,
            ),
          }
        : {}),
    };
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const coords =
    "location" in data ? await resolverCoordenadas(data.location) : {};

  const {
    animalType: _animalType,
    animalTypeId: _inputAnimalTypeId,
    sex: _sex,
    sexId: _inputSexId,
    status: _status,
    statusId: _inputStatusId,
    medicalStatus: _medicalStatus,
    medicalStatusId: _inputMedicalStatusId,
    ...petData
  } = data;
  const updated = await repo().save({
    ...existing,
    ...petData,
    ...(catalogIds?.animalTypeId !== undefined &&
    catalogIds.animalTypeId !== null
      ? { animalTypeId: catalogIds.animalTypeId }
      : {}),
    ...(catalogIds?.sexId !== undefined ? { sexId: catalogIds.sexId } : {}),
    ...(catalogIds?.statusId !== undefined && catalogIds.statusId !== null
      ? { statusId: catalogIds.statusId }
      : {}),
    ...(catalogIds?.medicalStatusId !== undefined &&
    catalogIds.medicalStatusId !== null
      ? { medicalStatusId: catalogIds.medicalStatusId }
      : {}),
    ...(isAdmin &&
    catalogIds?.reportStatusId !== undefined &&
    catalogIds.reportStatusId !== null
      ? { reportStatusId: catalogIds.reportStatusId }
      : {}),
    // Si edita un usuario (no admin), el reporte vuelve a "pendiente" para que
    // el admin revise el cambio antes de volver a publicarlo.
    ...(!isAdmin
      ? { reportStatusId: CatalogIds.petReportStatus.pendiente }
      : {}),
    ...coords,
  });
  const reloaded = await repo().findOneByOrFail({ id: updated.id });
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(reloaded, catalogValuesById));
}

export async function approveMascota(req: Request, res: Response) {
  const id = req.params.id;
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  existing.reportStatusId = CatalogIds.petReportStatus.activo;
  const saved = await repo().save(existing);
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

export async function finalizeMascota(req: Request, res: Response) {
  const id = req.params.id;
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  existing.reportStatusId = CatalogIds.petReportStatus.finalizado;
  const saved = await repo().save(existing);
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

export async function rejectMascota(req: Request, res: Response) {
  const id = req.params.id;
  const existing = await repo().findOneBy({ id });
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  existing.reportStatusId = CatalogIds.petReportStatus.rechazado;
  const saved = await repo().save(existing);
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
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
  const catalogValuesById = await getCatalogValuesById();
  res.json(notes.map((note) => serializePetNote(note, catalogValuesById)));
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

  let kindId: number = CatalogIds.petNoteKind.general;
  try {
    const resolvedKindId = await resolveOptionalCatalogId(
      Catalog.PET_NOTE_KIND,
      parsed.data.kindId,
      parsed.data.kind,
    );
    if (resolvedKindId) kindId = resolvedKindId;
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const note = noteRepo().create({
    petId,
    authorId,
    authorName,
    text: parsed.data.text,
    kindId,
  });
  const saved = await noteRepo().save(note);
  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json(serializePetNote(saved, catalogValuesById));
}
