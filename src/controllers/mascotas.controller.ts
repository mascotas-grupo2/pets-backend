import { Request, Response } from "express";
import { ILike, In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { User } from "../entity/User.js";
import { Followup } from "../entity/Followup.js";
import { Adoption } from "../entity/Adoption.js";
import { calculateCompatibility } from "../lib/matching.js";
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
import { notify } from "../lib/notify.js";
import { recordActivity } from "../lib/activity.js";
import { Message } from "../entity/Message.js";
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

function followupRepo() {
  return AppDataSource.getRepository(Followup);
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
  const activityLevel = catalogInfo(catalogValuesById, mascota.activityLevelId);
  const payload = { ...(mascota as any) };

  return {
    ...payload,
    viewsCount: mascota.viewsCount ?? 0,
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
    activityLevel: activityLevel?.code ?? null,
    activityLevelLabel: activityLevel?.label ?? null,
    activityLevelInfo: activityLevel,
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

/**
 * ¿Puede el solicitante ver esta mascota? Los reportes públicos (activo) son
 * visibles para todos; los demás estados (pendiente/rechazado/finalizado) solo
 * para el dueño o un admin. Evita IDOR en los endpoints sin filtro de estado.
 */
function canViewPet(mascota: Pet, authUser?: { id: number; role?: string }) {
  if (mascota.reportStatusId === CatalogIds.petReportStatus.activo) return true;
  if (!authUser) return false;
  if (authUser.role === "admin") return true;
  return mascota.userId === authUser.id;
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

const REPORT_STATUS_ID_BY_CODE: Record<string, number> = {
  pendiente: CatalogIds.petReportStatus.pendiente,
  activo: CatalogIds.petReportStatus.activo,
  rechazado: CatalogIds.petReportStatus.rechazado,
  finalizado: CatalogIds.petReportStatus.finalizado,
  reservada: CatalogIds.petReportStatus.reservada,
};

async function resolveReportStatusId(input: unknown) {
  if (input === undefined || input === null) return undefined;
  // Acepta el código ("activo", "rechazado", ...) que manda el front.
  if (typeof input === "string" && REPORT_STATUS_ID_BY_CODE[input.trim()]) {
    return REPORT_STATUS_ID_BY_CODE[input.trim()];
  }
  const numeric = Number(input);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  const id = await resolveCatalogValueId(
    Catalog.PET_REPORT_STATUS,
    { id: numeric },
    true,
  );
  return id ?? undefined;
}

function buildAdminPetQuery(reportStatusId?: number | null) {
  if (reportStatusId) return { reportStatusId };
  return undefined;
}

function parseOptionalInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

// Sort server-side (mismo patrón que solicitudes): ?sort=campo:ASC,campo2:DESC
const PET_SORT_MAP: Record<string, string> = {
  name: "name",
  tipo: "statusId",
  estado: "reportStatusId",
  fecha: "date",
  createdAt: "createdAt",
};
function parsePetOrder(req: Request): Record<string, "ASC" | "DESC"> {
  const raw = typeof req.query.sort === "string" ? req.query.sort : "";
  const order: Record<string, "ASC" | "DESC"> = {};
  for (const seg of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [field, dir] = seg.split(":").map((p) => p.trim());
    const column = PET_SORT_MAP[field];
    if (column) order[column] = dir?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  }
  if (Object.keys(order).length === 0) order.createdAt = "DESC";
  return order;
}

function buildAdminFilters(req: Request) {
  const animalTypeId = parseOptionalInt(req.query.animalTypeId);
  const statusId = parseOptionalInt(req.query.statusId);
  const search = req.query.name ?? req.query.q;
  const name = typeof search === "string" ? search.trim() : "";
  const nameFilter = name.length > 0 ? ILike(`%${name}%`) : undefined;

  return {
    ...(animalTypeId ? { animalTypeId } : {}),
    ...(statusId ? { statusId } : {}),
    ...(nameFilter ? { name: nameFilter } : {}),
  };
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

async function serializeAdminPets(mascotas: Pet[]) {
  if (mascotas.length === 0) return [];
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

  return mascotas.map((m) => {
    const s = byPet.get(m.id)!;
    const owner = m.userId != null ? ownerById.get(m.userId) : null;
    return {
      ...serializeMascota(m, catalogValuesById),
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      ownerIsAdmin: owner?.roleId === CatalogIds.userRole.admin,
      adoptionInterestCount: s.adoption,
      medicalNoteCount: s.medical,
      generalNoteCount: s.general,
      lastNoteAt: s.lastNoteAt,
    };
  });
}

export async function adminListMascotas(_req: Request, res: Response) {
  const mascotas = await repo().find({ order: { createdAt: "DESC" } });
  res.json(await serializeAdminPets(mascotas));
}

export async function adminListMascotasPaged(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  let reportStatusId: number | undefined;
  try {
    reportStatusId = await resolveReportStatusId(
      req.query.reportStatusId ?? req.query.reportStatus,
    );
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const filters = buildAdminFilters(req);
  const baseQuery = buildAdminPetQuery(reportStatusId);
  // La sección Mascotas filtra por situación del animal (perdido / refugio /
  // en adopción / adoptados) mediante ?statusCategory=...
  const categoryIds =
    PET_STATUS_CATEGORY[String(req.query.statusCategory ?? "")];
  const categoryFilter = categoryIds ? { statusId: In(categoryIds) } : {};
  const where = { ...(baseQuery ?? {}), ...filters, ...categoryFilter };

  const [mascotas, total] = await repo().findAndCount({
    where,
    order: parsePetOrder(req),
    take: pageSize,
    skip,
  });

  res.json({
    items: await serializeAdminPets(mascotas),
    total,
    page,
    pageSize,
    // Totales por estado del conjunto completo (para las cards), independientes
    // del filtro aplicado a la lista paginada.
    statusTotals: await reportStatusTotals(),
    petStatusTotals: await petStatusTotals(),
  });
}

// Categorías de situación del animal usadas por la sección Mascotas.
const PET_STATUS_CATEGORY: Record<string, number[]> = {
  perdido: [CatalogIds.petStatus.perdido],
  refugio: [
    CatalogIds.petStatus.encontrado,
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
  ],
  adopcion: [CatalogIds.petStatus.adopcion],
  adoptados: [CatalogIds.petStatus.adoptado],
};

// Conteos por categoría de situación (para las cards de la sección Mascotas).
async function petStatusTotals() {
  const rows = await repo()
    .createQueryBuilder("pet")
    .select("pet.statusId", "statusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("pet.statusId")
    .getRawMany<{ statusId: string; count: string }>();

  const totals = {
    todas: 0,
    perdido: 0,
    refugio: 0,
    adopcion: 0,
    adoptados: 0,
  };
  for (const row of rows) {
    const id = Number(row.statusId);
    const n = Number(row.count) || 0;
    totals.todas += n;
    if (id === CatalogIds.petStatus.perdido) totals.perdido += n;
    else if (id === CatalogIds.petStatus.adopcion) totals.adopcion += n;
    else if (id === CatalogIds.petStatus.adoptado) totals.adoptados += n;
    else totals.refugio += n;
  }
  return totals;
}

// Cuenta publicaciones agrupadas por reportStatus (para las cards del panel).
async function reportStatusTotals() {
  const rows = await repo()
    .createQueryBuilder("pet")
    .select("pet.reportStatusId", "reportStatusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("pet.reportStatusId")
    .getRawMany<{ reportStatusId: string; count: string }>();

  const totals: Record<string, number> = {
    pendiente: 0,
    activo: 0,
    rechazado: 0,
    finalizado: 0,
    reservada: 0,
  };
  const byId: Record<number, string> = {
    [CatalogIds.petReportStatus.pendiente]: "pendiente",
    [CatalogIds.petReportStatus.activo]: "activo",
    [CatalogIds.petReportStatus.rechazado]: "rechazado",
    [CatalogIds.petReportStatus.finalizado]: "finalizado",
    [CatalogIds.petReportStatus.reservada]: "reservada",
  };
  for (const row of rows) {
    const code = byId[Number(row.reportStatusId)];
    if (code) totals[code] = Number(row.count) || 0;
  }
  return totals;
}

export async function adminListMascotasByStatus(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  let reportStatusId: number | undefined;
  try {
    reportStatusId = await resolveReportStatusId(req.params.status);
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const filters = buildAdminFilters(req);
  const baseQuery = buildAdminPetQuery(reportStatusId);
  const where = baseQuery ? { ...baseQuery, ...filters } : filters;

  const [mascotas, total] = await repo().findAndCount({
    where,
    order: parsePetOrder(req),
    take: pageSize,
    skip,
  });

  res.json({
    items: await serializeAdminPets(mascotas),
    total,
    page,
    pageSize,
    statusTotals: await reportStatusTotals(),
  });
}

export async function getMascota(req: Request, res: Response) {
  const id = req.params.id;
  let mascota;
  try {
    mascota = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!mascota) return res.status(404).json({ error: "Pet no encontrada" });
  // No revelamos la existencia de reportes no-públicos a terceros.
  if (!canViewPet(mascota, req.authUser)) {
    return res.status(404).json({ error: "Pet no encontrada" });
  }
  // Conteo de vistas: incrementamos si NO es el dueño (no infla sus propias vistas).
  // Await para que persista y el valor devuelto sea consistente.
  if (mascota.userId == null || mascota.userId !== req.authUser?.id) {
    try {
      await repo().increment({ id }, "viewsCount", 1);
      mascota.viewsCount = (mascota.viewsCount ?? 0) + 1;
    } catch {
      /* el conteo de vistas es best-effort */
    }
  }
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(mascota, catalogValuesById));
}

/**
 * Compatibilidad entre el usuario logueado y una mascota (para el detalle
 * público). Usa la solicitud para esa mascota si existe; sino, el perfil de
 * adoptante más reciente del usuario.
 */
export async function getMascotaCompatibility(req: Request, res: Response) {
  const id = req.params.id;
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "No autenticado" });
  }
  let pet;
  try {
    pet = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const adoptionRepo = AppDataSource.getRepository(Adoption);
  const forPet = await adoptionRepo.findOne({
    where: { userId: userId as number, petId: id },
    order: { createdAt: "DESC" },
  });
  const latest =
    forPet ??
    (await adoptionRepo.findOne({
      where: { userId: userId as number },
      order: { createdAt: "DESC" },
    }));

  if (!latest) {
    return res.json({
      score: null,
      factors: [],
      source: "none",
      adoptionId: null,
    });
  }
  const { score, factors } = calculateCompatibility(latest, pet);
  res.json({
    score,
    factors,
    source: forPet ? "application" : "profile",
    adoptionId: latest.id,
  });
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
      activityLevelId: maybeNumber(bodyForValidation.activityLevelId),
    };

    // campos booleanos enviados como "true"/"false"
    const booleanFields = [
      "hasCollar",
      "hasTag",
      "microchipped",
      "neutered",
      "vaccinated",
      "friendlyWithKids",
      "friendlyWithPets",
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
    activityLevelId: number | null | undefined;
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
      activityLevelId: await resolveOptionalCatalogId(
        Catalog.ACTIVITY_LEVEL,
        data.activityLevelId,
        data.activityLevel,
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
  // Solo el usuario autenticado es dueño del reporte. NO confiamos en un
  // `userId` del body ni asociamos por contactEmail: ambos permitirían
  // asignar un reporte a la cuenta de otra persona (spoofing de propiedad).
  const userId = req.authUser?.id ?? null;
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
    ...(catalogIds.activityLevelId !== undefined &&
    catalogIds.activityLevelId !== null
      ? { activityLevelId: catalogIds.activityLevelId }
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
  // recordActivity ya notifica a los admins (centralizado en lib/activity.ts).
  await recordActivity({
    type: "publicacion",
    title: `Nueva publicación: ${reloaded.name ?? "mascota"}`,
    actorUserId: userId,
    refType: "pet",
    refId: reloaded.id,
    link: "/admin/publicacion",
  });

  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json(serializeMascota(reloaded, catalogValuesById));
}

export async function listMascotasByIds(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.json([]);

  const mascotas = await repo().findBy({ id: In(ids) });
  // Solo devolvemos los visibles para el solicitante (evita IDOR por id).
  const visibles = mascotas.filter((m) => canViewPet(m, req.authUser));
  const catalogValuesById = await getCatalogValuesById();
  const serialized = visibles.map((mascota) =>
    serializeMascota(mascota, catalogValuesById),
  ) as Array<
    ReturnType<typeof serializeMascota> & { rejectionReason?: string }
  >;

  // A las publicaciones rechazadas les adjuntamos el motivo del último rechazo
  // (guardado como nota "Rechazo: ..."), así el dueño puede ver por qué se rechazó.
  const rejectedIds = visibles
    .filter((m) => m.reportStatusId === CatalogIds.petReportStatus.rechazado)
    .map((m) => m.id);
  if (rejectedIds.length) {
    const notes = await noteRepo()
      .createQueryBuilder("note")
      .where("note.petId IN (:...ids)", { ids: rejectedIds })
      .andWhere("note.text LIKE :prefix", { prefix: "Rechazo:%" })
      .orderBy("note.createdAt", "DESC")
      .getMany();
    const reasonByPet = new Map<string, string>();
    for (const note of notes) {
      if (!reasonByPet.has(note.petId)) {
        reasonByPet.set(note.petId, note.text.replace(/^Rechazo:\s*/, ""));
      }
    }
    for (const pet of serialized) {
      const reason = reasonByPet.get(pet.id);
      if (reason) pet.rejectionReason = reason;
    }
  }

  res.json(serialized);
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
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  // Permisos de edición:
  //  - El dueño (no admin) edita solo sus propias publicaciones.
  //  - El admin SOLO edita publicaciones que pertenecen a un admin (la propia o
  //    la de otro admin); el contenido cargado por un usuario común no se edita,
  //    solo se modera (aprobar/rechazar/eliminar).
  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";

  let adminManageOnly = false;
  if (!isAdmin) {
    if (!authUser || authUser.id !== existing.userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
  } else {
    const owner =
      existing.userId != null
        ? await userRepo().findOneBy({ id: existing.userId })
        : null;
    const ownerIsAdmin = owner?.roleId === CatalogIds.userRole.admin;
    // Publicación de un usuario común: el admin solo gestiona estado/moderación,
    // no edita su contenido (nombre, descripción, fotos, etc.).
    if (!ownerIsAdmin) adminManageOnly = true;
  }

  let catalogIds:
    | {
        animalTypeId?: number | null;
        sexId?: number | null;
        statusId?: number | null;
        medicalStatusId?: number | null;
        reportStatusId?: number | null;
        activityLevelId?: number | null;
      }
    | undefined;
  // si no es admin, evitamos que modifique el reportStatus
  const data = { ...(parsed.data as any) };
  if (!isAdmin) {
    delete data.reportStatus;
    delete data.reportStatusId;
  }

  if (adminManageOnly) {
    const gestion = new Set([
      "status",
      "statusId",
      "reportStatus",
      "reportStatusId",
      "medicalStatus",
      "medicalStatusId",
    ]);
    for (const k of Object.keys(data)) {
      if (!gestion.has(k)) delete data[k];
    }
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
      activityLevelId: await resolveOptionalCatalogId(
        Catalog.ACTIVITY_LEVEL,
        data.activityLevelId,
        data.activityLevel,
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

  // "finalizado" no es un estado que se setee a mano: lo maneja el flujo de adopción.
  if (catalogIds.reportStatusId === CatalogIds.petReportStatus.finalizado) {
    return res.status(409).json({
      error:
        "No se puede pasar una publicación a finalizado manualmente; se finaliza al concretarse la adopción.",
    });
  }

  // "adoptado" tampoco se setea a mano: solo vía una adopción (formal o entrega
  // directa), para que siempre quede registro de quién recibió la mascota.
  if (catalogIds.statusId === CatalogIds.petStatus.adoptado) {
    return res.status(409).json({
      error:
        "No se puede marcar 'adoptado' a mano; usá 'Registrar adopción directa' para dejar registro de quién la recibió.",
    });
  }

  if (
    catalogIds.statusId != null &&
    existing.statusId != null &&
    catalogIds.statusId !== existing.statusId
  ) {
    const S = CatalogIds.petStatus;
    const PET_STATUS_NEXT: Record<number, number[]> = {
      [S.perdido]: [S.encontrado, S.devueltaAlDueno],
      [S.encontrado]: [S.transito, S.medico, S.adopcion, S.devueltaAlDueno],
      [S.transito]: [S.medico, S.adopcion, S.devueltaAlDueno],
      [S.medico]: [S.transito, S.adopcion, S.devueltaAlDueno],
      [S.adopcion]: [S.adoptado, S.devueltaAlDueno],
      [S.adoptado]: [],
      [S.devueltaAlDueno]: [],
    };
    const permitidos = PET_STATUS_NEXT[existing.statusId] ?? [];
    if (!permitidos.includes(catalogIds.statusId)) {
      return res.status(409).json({
        error:
          "Transición de estado no permitida: el estado de la mascota solo puede avanzar.",
      });
    }
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
    ...(catalogIds?.activityLevelId !== undefined &&
    catalogIds.activityLevelId !== null
      ? { activityLevelId: catalogIds.activityLevelId }
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

export async function updatePetPhotos(req: Request, res: Response) {
  const id = req.params.id;
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";
  if (!isAdmin) {
    if (!authUser || authUser.id !== existing.userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
  } else {
    const owner =
      existing.userId != null
        ? await userRepo().findOneBy({ id: existing.userId })
        : null;
    const ownerIsAdmin = owner?.roleId === CatalogIds.userRole.admin;
    if (!ownerIsAdmin) {
      return res.status(403).json({
        error:
          "Las fotos de publicaciones de usuarios no se editan, solo se moderan",
      });
    }
  }

  // URLs a conservar: solo las que realmente pertenecen a esta mascota.
  const current = Array.isArray(existing.photos)
    ? existing.photos
    : existing.photo
      ? [existing.photo]
      : [];
  let keep: string[] = [];
  const rawKeep = (req.body as any)?.keep;
  try {
    const arr = typeof rawKeep === "string" ? JSON.parse(rawKeep) : rawKeep;
    if (Array.isArray(arr)) {
      keep = arr.filter((u: unknown): u is string => typeof u === "string");
    }
  } catch {
    keep = [];
  }
  keep = keep.filter((u) => current.includes(u));

  // Subir las imágenes nuevas a MinIO (carpeta = id de la mascota).
  const files = (req as any).files as Express.Multer.File[] | undefined;
  const bucket = process.env.MINIO_BUCKET ?? "report-images";
  const uploaded: string[] = [];
  if (Array.isArray(files) && files.length > 0) {
    try {
      await createFolderInBucket(bucket, String(existing.id));
    } catch {
      /* la carpeta puede existir ya */
    }
    for (const f of files) {
      try {
        const url = await uploadFileToMinio(
          bucket,
          String(existing.id),
          f.originalname,
          f.buffer,
          f.mimetype,
        );
        if (url) uploaded.push(url);
      } catch (e) {
        console.warn("Error subiendo foto de mascota:", e);
        return res.status(500).json({ error: "No se pudo subir la foto" });
      }
    }
  }

  const nextPhotos = [...keep, ...uploaded];
  // Una publicación no puede quedarse sin ninguna foto.
  if (nextPhotos.length === 0) {
    return res
      .status(400)
      .json({ error: "La publicación debe tener al menos una foto." });
  }
  existing.photos = nextPhotos;
  existing.photo = nextPhotos[0];
  // Editar contenido de un usuario común reabre la moderación.
  if (!isAdmin) {
    existing.reportStatusId = CatalogIds.petReportStatus.pendiente;
  }

  const updated = await repo().save(existing);
  const reloaded = await repo().findOneByOrFail({ id: updated.id });
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(reloaded, catalogValuesById));
}

export async function approveMascota(req: Request, res: Response) {
  const id = req.params.id;
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  const R = CatalogIds.petReportStatus;
  if (existing.reportStatusId === R.activo) {
    return res.status(409).json({ error: "La publicación ya está activa." });
  }
  if (
    existing.reportStatusId === R.finalizado ||
    existing.reportStatusId === R.reservada
  ) {
    return res.status(409).json({
      error: "No se puede aprobar una publicación finalizada o reservada.",
    });
  }
  existing.reportStatusId = R.activo;
  const saved = await repo().save(existing);
  await notify(existing.userId, {
    type: "publication",
    title: "Tu publicación fue aprobada",
    body: `"${existing.name ?? "Tu publicación"}" ya está visible en el listado.`,
    link: `/mascotas-perdidas/${existing.id}`,
  });
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

/**
 * Cierre "reunido/encontrado": el dueño (o un admin) marca que una mascota
 * perdida apareció. No todo termina en adopción; este es el cierre del flujo de
 * pérdida. Deja la publicación finalizada y la mascota en estado "encontrado".
 * No aplica a publicaciones de adopción (esas se cierran por el flujo de adopción).
 */
export async function resolveMascota(req: Request, res: Response) {
  const id = req.params.id;
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";
  if (!isAdmin && (!authUser || authUser.id !== existing.userId)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const S = CatalogIds.petStatus;
  if (existing.statusId === S.adopcion || existing.statusId === S.adoptado) {
    return res.status(409).json({
      error:
        "Esta publicación es de adopción; se cierra por el flujo de adopción, no como 'apareció'.",
    });
  }
  if (existing.reportStatusId === CatalogIds.petReportStatus.finalizado) {
    return res.status(409).json({ error: "La publicación ya está cerrada." });
  }

  existing.statusId = S.encontrado;
  existing.reportStatusId = CatalogIds.petReportStatus.finalizado;
  const saved = await repo().save(existing);
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

export async function finalizeMascota(_req: Request, res: Response) {
  // Las publicaciones NO se finalizan a mano: solo pasan a "finalizado" de forma
  // automática cuando se concreta una adopción (solicitud ACEPTADA).
  return res.status(409).json({
    error:
      "Una publicación no se puede finalizar manualmente; se finaliza sola al concretarse la adopción.",
  });
}

/**
 * Entrega directa: el admin entrega la mascota a alguien que conoce, sin pasar
 * por el proceso formal de solicitud. Deja la mascota adoptada + finalizada y
 * registra a quién se entregó (nota), así siempre queda rastro.
 */
export async function entregaDirecta(req: Request, res: Response) {
  const id = req.params.id;
  const recipientName =
    typeof req.body?.recipientName === "string"
      ? req.body.recipientName.trim()
      : "";
  if (!recipientName) {
    return res
      .status(400)
      .json({ error: "Indicá a quién se entregó la mascota." });
  }

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  if (existing.statusId === CatalogIds.petStatus.adoptado) {
    return res.status(409).json({ error: "La mascota ya está adoptada." });
  }

  existing.statusId = CatalogIds.petStatus.adoptado;
  existing.reportStatusId = CatalogIds.petReportStatus.finalizado;
  const saved = await repo().save(existing);

  // Registro de auditoría: quién la recibió y qué admin la entregó.
  const adminId = req.authUser?.id ?? null;
  let adminName: string | null = null;
  if (adminId) {
    const admin = await userRepo().findOneBy({ id: adminId });
    adminName = admin?.name ?? admin?.email ?? null;
  }
  await noteRepo().save(
    noteRepo().create({
      petId: existing.id,
      authorId: adminId,
      authorName: adminName,
      text: `Adopción directa: entregada a ${recipientName}${
        adminName ? ` por ${adminName}` : ""
      }.`,
      kindId: CatalogIds.petNoteKind.adopcion,
    }),
  );

  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

export async function rejectMascota(req: Request, res: Response) {
  const id = req.params.id;
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });
  const R = CatalogIds.petReportStatus;
  if (
    existing.reportStatusId === R.finalizado ||
    existing.reportStatusId === R.reservada
  ) {
    return res.status(409).json({
      error: "No se puede rechazar una publicación finalizada o reservada.",
    });
  }
  existing.reportStatusId = R.rechazado;
  const saved = await repo().save(existing);

  // Si el admin envió un motivo, lo dejamos registrado como nota de la publicación.
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason) {
    const authorId = req.authUser?.id ?? null;
    let authorName: string | null = null;
    if (authorId) {
      const author = await userRepo().findOneBy({ id: authorId });
      authorName = author?.name ?? author?.email ?? null;
    }
    await noteRepo().save(
      noteRepo().create({
        petId: existing.id,
        authorId,
        authorName,
        text: `Rechazo: ${reason}`,
        kindId: CatalogIds.petNoteKind.general,
      }),
    );
  }

  await notify(existing.userId, {
    type: "publication",
    title: "Tu publicación fue rechazada",
    body: reason ? `Motivo: ${reason}` : "Editala para que vuelva a revisión.",
    link: "/account",
  });

  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(saved, catalogValuesById));
}

export async function deleteMascota(req: Request, res: Response) {
  const id = req.params.id;
  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  // El dueño puede eliminar su propia publicación; el admin puede eliminar
  // cualquiera. (La ruta pasó de requireAdmin a requireAuth para habilitar esto.)
  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";
  if (!isAdmin && (!authUser || authUser.id !== existing.userId)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    await AppDataSource.transaction(async (manager) => {
      await manager.getRepository(Followup).delete({ petId: id });
      await manager.getRepository(PetNote).delete({ petId: id });
      await manager.getRepository(Pet).remove(existing);
    });
  } catch (err) {
    console.error("Error al eliminar mascota:", err);
    return res.status(409).json({
      error: "No se pudo eliminar la publicación por datos asociados.",
    });
  }
  res.status(204).send();
}

/**
 * Reclamo de mascota: un usuario reporta que una mascota podría ser suya.
 * Envía un mensaje a los admins (para que puedan responder) y registra una
 * nota en la publicación como respaldo. El link de la notificación apunta al
 * detalle público de la mascota.
 */
export async function claimPet(req: Request, res: Response) {
  const id = req.params.id;
  const { claimantName, claimantPhone, claimantEmail, description } =
    req.body ?? {};

  if (!claimantName || !claimantPhone) {
    return res.status(400).json({ error: "Nombre y teléfono son requeridos." });
  }

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  // No se puede reclamar una mascota que ya está en estado final
  const S = CatalogIds.petStatus;
  if (
    existing.statusId === S.adoptado ||
    existing.statusId === S.devueltaAlDueno
  ) {
    return res.status(409).json({
      error:
        "Esta mascota ya tiene un desenlace registrado (adoptada o devuelta).",
    });
  }

  if (existing.reportStatusId === CatalogIds.petReportStatus.finalizado) {
    return res.status(409).json({ error: "La publicación ya está cerrada." });
  }

  // Nota de respaldo en la publicación
  const noteText = [
    `🔔 RECLAMO de ${claimantName}`,
    `Tel: ${claimantPhone}`,
    claimantEmail ? `Email: ${claimantEmail}` : null,
    description ? `Mensaje: ${description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await noteRepo().save(
    noteRepo().create({
      petId: existing.id,
      authorName: claimantName,
      text: noteText,
      kindId: CatalogIds.petNoteKind.general,
    }),
  );

  const ownerName = existing.userId
    ? (await userRepo().findOneBy({ id: existing.userId }))?.name ?? "dueño registrado"
    : null;

  const msgContent = [
    `🔔 RECLAMO DE MASCOTA`,
    ``,
    `Mascota: ${existing.name ?? "sin nombre"}`,
    `Link: /mascotas-perdidas/${existing.id}`,
    ``,
    `— Datos de quien reclama —`,
    `Nombre: ${claimantName}`,
    `Teléfono: ${claimantPhone}`,
    ...(claimantEmail ? [`Email: ${claimantEmail}`] : []),
    ...(description ? [`Motivo: ${description}`] : []),
    ``,
    `— Dueño de la publicación —`,
    ownerName ? `Nombre: ${ownerName}` : `Publicación sin dueño registrado`,
    ``,
    `Respondé a este mensaje para coordinar el reencuentro.`,
  ].join("\n");

  // Obtener admins
  const admins = await userRepo().find({
    where: { roleId: CatalogIds.userRole.admin },
  });
  const messageRepo = AppDataSource.getRepository(Message);

  if (req.authUser?.id) {
    // Usuario autenticado: enviamos el mensaje desde él a los admins
    for (const admin of admins) {
      const msg = messageRepo.create({
        senderId: req.authUser.id,
        receiverId: admin.id,
        content: msgContent,
        photo: null,
        read: false,
      });
      await messageRepo.save(msg);

      await notify(admin.id, {
        type: "message",
        title: `🔔 Reclamo: ${existing.name ?? "mascota"} – ${claimantName}`,
        body: `Reclama ser el dueño de ${existing.name ?? "mascota"}. Respondé desde Mensajes.`,
        link: `/admin/mensajes?user=${req.authUser.id}`,
      });
    }
  } else {
    // Usuario no autenticado: solo creamos la notificación (no se puede responder)
    for (const admin of admins) {
      await notify(admin.id, {
        type: "publication",
        title: `🔔 Reclamo de mascota: ${existing.name ?? "sin nombre"}`,
        body: `${claimantName} reclama ser el dueño (sin cuenta). Tel: ${claimantPhone}.`,
        link: `/mascotas-perdidas/${existing.id}`,
      });
    }
  }

  // Notificar al dueño de la publicación si está registrado
  if (existing.userId) {
    await notify(existing.userId, {
      type: "publication",
      title: `Alguien reclama ser el dueño de ${existing.name ?? "tu mascota"}`,
      body: `Comunicate con el refugio para coordinar el reencuentro.`,
      link: `/mascotas-perdidas/${existing.id}`,
    });
  }

  res.json({
    ok: true,
    message: "Reclamo registrado. El refugio se comunicará con vos.",
  });
}

/**
 * Confirmar devolución: el admin verifica el reclamo y marca la mascota
 * como devuelta al dueño. Cierra la publicación y cancela adopciones activas.
 */
export async function confirmReturn(req: Request, res: Response) {
  const id = req.params.id;
  const { returnedTo } = req.body ?? {};

  if (!returnedTo || typeof returnedTo !== "string") {
    return res
      .status(400)
      .json({ error: "Indicá a quién se devolvió la mascota." });
  }

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  if (existing.reportStatusId === CatalogIds.petReportStatus.finalizado) {
    return res.status(409).json({ error: "La publicación ya está cerrada." });
  }

  const S = CatalogIds.petStatus;
  if (existing.statusId === S.devueltaAlDueno) {
    return res
      .status(409)
      .json({ error: "La mascota ya fue devuelta a su dueño." });
  }

  // Transacción: cambiar estado + cerrar + cancelar adopciones activas + nota
  await AppDataSource.transaction(async (manager) => {
    const petRepo = manager.getRepository(Pet);
    const adoptionRepo = manager.getRepository(Adoption);
    const followupRepo = manager.getRepository(Followup);
    const noteRepo = manager.getRepository(PetNote);

    // Cambiar estado
    existing.statusId = S.devueltaAlDueno;
    existing.reportStatusId = CatalogIds.petReportStatus.finalizado;
    await petRepo.save(existing);

    // Cancelar adopciones activas
    await adoptionRepo.update(
      { petId: id, statusId: CatalogIds.adoptionStatus.nueva },
      { statusId: CatalogIds.adoptionStatus.descartada },
    );
    await adoptionRepo.update(
      { petId: id, statusId: CatalogIds.adoptionStatus.enEvaluacion },
      { statusId: CatalogIds.adoptionStatus.descartada },
    );

    // Cancelar seguimientos pendientes relacionados con adopción
    await followupRepo.update(
      { petId: id, statusId: CatalogIds.followupStatus.pendiente },
      { statusId: CatalogIds.followupStatus.completado },
    );

    // Nota de auditoría
    const adminId = req.authUser?.id ?? null;
    let adminName: string | null = null;
    if (adminId) {
      const admin = await userRepo().findOneBy({ id: adminId });
      adminName = admin?.name ?? admin?.email ?? null;
    }
    await noteRepo.save(
      noteRepo.create({
        petId: existing.id,
        authorId: adminId,
        authorName: adminName,
        text: `✅ Devuelta al dueño: entregada a ${returnedTo}${adminName ? ` por ${adminName}` : ""}. Reclamo gestionado por el refugio.`,
        kindId: CatalogIds.petNoteKind.general,
      }),
    );
  });

  // Notificar
  if (existing.userId) {
    await notify(existing.userId, {
      type: "publication",
      title: `${existing.name ?? "Tu mascota"} fue devuelta a su familia`,
      body: `El refugio confirmó la devolución. Gracias por usar la plataforma.`,
      link: `/mascotas-perdidas/${existing.id}`,
    });
  }

  // Recargar y devolver
  const reloaded = await repo().findOneByOrFail({ id });
  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(reloaded, catalogValuesById));
}

export async function listPetNotes(req: Request, res: Response) {
  const petId = req.params.id;
  let exists;
  try {
    exists = await repo().findOneBy({ id: petId });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
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
  let pet;
  try {
    pet = await repo().findOneBy({ id: petId });
  } catch (err) {
    return res.status(400).json({ error: "Id invalido" });
  }
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
