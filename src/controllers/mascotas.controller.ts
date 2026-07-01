import { Request, Response } from "express";
import { ILike, In, LessThan } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { User } from "../entity/User.js";
import { Followup } from "../entity/Followup.js";
import { Adoption } from "../entity/Adoption.js";
import { Refugio } from "../entity/Refugio.js";
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
import type { AuthUser } from "../lib/auth.js";
import {
  applyPetVisibility,
  petVisibilityWhere,
  stampRefugioIfManaged,
} from "../lib/tenant.js";
import {
  DAY_MS,
  EXPIRY_GRACE_DAYS,
  EXPIRY_WARN_DAYS,
  expiryFromStatus,
  expiryInfo,
  isExpiredBeyondGrace,
} from "../lib/pet-expiry.js";

function repo() {
  return dbManager().getRepository(Pet);
}

function userRepo() {
  return dbManager().getRepository(User);
}

function noteRepo() {
  return dbManager().getRepository(PetNote);
}

function followupRepo() {
  return dbManager().getRepository(Followup);
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

  const exp = expiryInfo(mascota.expiresAt);
  return {
    ...payload,
    viewsCount: mascota.viewsCount ?? 0,
    expiresAt: mascota.expiresAt ?? null,
    daysLeft: exp.daysLeft,
    expired: exp.expired,
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
  const refugioId = parseOptionalInt(req.query.refugioId);
  const zonaRaw = typeof req.query.zona === "string" ? req.query.zona.trim() : "";
  const zonaFilter = zonaRaw ? ILike(`%${zonaRaw}%`) : undefined;
  const extra = {
    ...(refugioId ? { refugioId } : {}),
    ...(zonaFilter ? { location: zonaFilter } : {}),
  };
  const mascotas = await repo().find({
    where: userId
      ? [
          { reportStatusId: CatalogIds.petReportStatus.activo, ...extra },
          {
            userId,
            reportStatusId: In([
              CatalogIds.petReportStatus.pendiente,
              CatalogIds.petReportStatus.rechazado,
            ]),
            ...extra,
          },
        ]
      : { reportStatusId: CatalogIds.petReportStatus.activo, ...extra },
    order: { id: "DESC" },
  });
  // Pipeline de refugio: una mascota recuperada que está siendo tratada
  // ("En refugio" / "En tránsito" / "En tratamiento médico") queda EN PAUSA,
  // fuera del listado público, hasta que se republica en "En adopción".
  // El dueño la sigue viendo (para no perderla de vista); admins la ven en su
  // panel. Reaparece sola al pasar a "En adopción" (que no está en pausa).
  const PAUSED_STATUS = new Set<number>([
    CatalogIds.petStatus.encontrado,
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
  ]);
  const esPropia = (m: Pet) =>
    userId != null && (m.userId === userId || m.ownerUserId === userId);

  // Ocultar del público las publicaciones vencidas hace más que la gracia
  // (siguen en la DB y en "Mis reportes"; reaparecen si el dueño renueva).
  const graceMs = EXPIRY_GRACE_DAYS * DAY_MS;
  const visibles = mascotas.filter((m) => {
    // En pausa (pipeline de refugio): fuera del público, salvo al dueño.
    if (m.statusId != null && PAUSED_STATUS.has(m.statusId) && !esPropia(m)) {
      return false;
    }
    if (!m.expiresAt) return true;
    const overdueMs = Date.now() - new Date(m.expiresAt).getTime();
    if (overdueMs <= graceMs) return true;
    // Las propias del usuario sí se le muestran (para que pueda renovarlas).
    return esPropia(m);
  });
  const catalogValuesById = await getCatalogValuesById();
  const refugioIds = [
    ...new Set(
      mascotas
        .map((m) => m.refugioId)
        .filter((r): r is number => Number.isInteger(r)),
    ),
  ];
  const refugios = refugioIds.length
    ? await dbManager().getRepository(Refugio).find({ where: { id: In(refugioIds) } })
    : [];
  const refugioById = new Map(refugios.map((r) => [r.id, r]));
  res.json(
    visibles.map((mascota) => ({
      ...serializeMascota(mascota, catalogValuesById),
      refugioName:
        mascota.refugioId != null
          ? (refugioById.get(mascota.refugioId)?.name ?? null)
          : null,
      location:
        mascota.refugioId != null
          ? (refugioById.get(mascota.refugioId)?.location ?? mascota.location)
          : mascota.location,
    })),
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
  // ?vencida=1 → solo publicaciones vencidas (expiresAt < ahora; LessThan ya excluye null).
  const soloVencidas =
    req.query.vencida === "1" || req.query.vencida === "true";

  return {
    ...(animalTypeId ? { animalTypeId } : {}),
    ...(statusId ? { statusId } : {}),
    ...(nameFilter ? { name: nameFilter } : {}),
    ...(soloVencidas ? { expiresAt: LessThan(new Date()) } : {}),
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

  const refugioIds = [
    ...new Set(
      mascotas
        .map((m) => m.refugioId)
        .filter((r): r is number => Number.isInteger(r)),
    ),
  ];
  const refugios = refugioIds.length
    ? await dbManager().getRepository(Refugio).find({ where: { id: In(refugioIds) } })
    : [];
  const refugioById = new Map(refugios.map((r) => [r.id, r]));

  return mascotas.map((m) => {
    const s = byPet.get(m.id)!;
    const owner = m.userId != null ? ownerById.get(m.userId) : null;
    return {
      ...serializeMascota(m, catalogValuesById),
      refugioName:
        m.refugioId != null ? (refugioById.get(m.refugioId)?.name ?? null) : null,
      location:
        m.refugioId != null
          ? (refugioById.get(m.refugioId)?.location ?? m.location)
          : m.location,
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

export async function adminListMascotas(req: Request, res: Response) {
  const mascotas = await repo().find({
    where: petVisibilityWhere({}, req.authUser),
    order: { createdAt: "DESC" },
  });
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
  const where = petVisibilityWhere(
    { ...(baseQuery ?? {}), ...filters, ...categoryFilter },
    req.authUser,
  );

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
    statusTotals: await reportStatusTotals(req.authUser),
    petStatusTotals: await petStatusTotals(req.authUser),
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
async function petStatusTotals(authUser?: AuthUser | null) {
  const totalsQb = repo()
    .createQueryBuilder("pet")
    .select("pet.statusId", "statusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("pet.statusId");
  applyPetVisibility(totalsQb, "pet", authUser);
  const rows = await totalsQb.getRawMany<{ statusId: string; count: string }>();

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
async function reportStatusTotals(authUser?: AuthUser | null) {
  const totalsQb = repo()
    .createQueryBuilder("pet")
    .select("pet.reportStatusId", "reportStatusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("pet.reportStatusId");
  applyPetVisibility(totalsQb, "pet", authUser);
  const rows = await totalsQb.getRawMany<{ reportStatusId: string; count: string }>();

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

  // Vencidas: publicaciones activas cuyo vencimiento ya pasó (transversal: una
  // "Publicada" puede estar vencida). No es un reportStatus, va aparte.
  const vencidasQb = repo()
    .createQueryBuilder("pet")
    .where("pet.reportStatusId = :activo", {
      activo: CatalogIds.petReportStatus.activo,
    })
    .andWhere("pet.expiresAt < :now", { now: new Date() });
  applyPetVisibility(vencidasQb, "pet", authUser);
  const vencidas = await vencidasQb.getCount();

  return { ...totals, vencidas };
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
  const where = petVisibilityWhere(
    { ...(baseQuery ?? {}), ...filters },
    req.authUser,
  );

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
    statusTotals: await reportStatusTotals(req.authUser),
  });
}

/** Detalle admin de UNA mascota (para abrir el drawer desde otras secciones). */
export async function getAdminPetById(req: Request, res: Response) {
  const id = req.params.id;
  let pet;
  try {
    // Scoped al refugio del admin (más reportes públicos sin refugio); el
    // superadmin ve cualquiera. Evita abrir por id mascotas de otro refugio.
    pet = await repo().findOne({
      where: petVisibilityWhere({ id }, req.authUser),
    });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });
  const [serialized] = await serializeAdminPets([pet]);
  res.json(serialized);
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
  // Coherencia con el listado: si venció hace más que la gracia, también se oculta
  // del DETALLE para el público (sino "oculta" se podía esquivar con el link directo).
  // El dueño, el dueño verificado y el admin la siguen viendo para poder renovarla.
  if (isExpiredBeyondGrace(mascota.expiresAt)) {
    const u = req.authUser;
    const esDuenoOAdmin =
      u != null &&
      (u.role === "admin" ||
        mascota.userId === u.id ||
        mascota.ownerUserId === u.id);
    if (!esDuenoOAdmin) {
      return res.status(404).json({ error: "Pet no encontrada" });
    }
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
  const refugio =
    mascota.refugioId != null
      ? await dbManager().getRepository(Refugio).findOneBy({ id: mascota.refugioId })
      : null;

  let claimedByMe = false;
  if (req.authUser?.id) {
    const userTag = `Usuario ID: ${req.authUser.id}`;
    const notes = await noteRepo().find({ where: { petId: id } });
    claimedByMe = notes.some(
      (n) => n.text.includes("🔔 RECLAMO") && n.text.includes(userTag),
    );
  }

  res.json({
    ...serializeMascota(mascota, catalogValuesById),
    refugioName: refugio?.name ?? null,
    location: refugio?.location ?? mascota.location,
    claimedByMe,
  });
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

  const adoptionRepo = dbManager().getRepository(Adoption);
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
      "isOwner",
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
    isOwner: _isOwner,
    ...petData
  } = data;
  // Si el usuario está autenticado, es el dueño publicando su propia mascota.
  // Si es anónimo, isOwner = false y quedará pendiente de verificación.
  const isOwner = req.authUser != null;

  // Si el usuario es admin, NO se marca como dueño automáticamente
  const isAdmin = req.authUser?.role === "admin";
  const finalIsOwner = isOwner && !isAdmin;

  const userId = req.authUser?.id ?? null;
  const mascota = repo().create({
    ...petData,
    isOwner: finalIsOwner,
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
    expiresAt: expiryFromStatus(catalogIds.statusId, new Date()),
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
    refugioId: reloaded.refugioId ?? null,
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

  // Incluir publicaciones donde el usuario es el creador original O el dueño verificado.
  const mascotas = await repo().find({
    where: [
      { userId: id },
      { ownerUserId: id },
    ],
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
  //  - El admin edita publicaciones de otro admin libremente.
  //  - El admin edita publicaciones de usuarios comunes solo si:
  //      * La mascota tiene dueño verificado (isOwner === true): puede
  //        enriquecer datos y gestionar estado.
  //      * No tiene dueño verificado: solo gestiona estado/moderación.
  // isOwner NO se puede modificar directamente; solo se activa vía approveClaim.
  const authUser = req.authUser;
  const isAdmin = authUser?.role === "admin";

  let adminManageOnly = false;
  // Estados gestionados por el refugio: una vez que la mascota entra al circuito
  // de adopción (tránsito / tratamiento / en adopción / adoptado / devuelta),
  // deja de ser un reporte editable por el usuario y pasa a manejarla SOLO el
  // refugio (admin), que le va cargando vacunas, tratamiento, etc.
  const REFUGIO_MANAGED = new Set<number>([
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.adoptado,
    CatalogIds.petStatus.devueltaAlDueno,
  ]);
  // Opción A: una vez que la publicación tiene dueño verificado (isOwner), solo
  // el refugio (admin) edita el contenido —ni el dueño verificado ni el
  // publicador original—. Antes de la verificación, el publicador original
  // edita su propia publicación.
  if (!isAdmin) {
    if (existing.isOwner) {
      return res.status(403).json({
        error: "Esta publicación ya fue verificada por el refugio. Solo el refugio puede editarla.",
      });
    }
    if (existing.userId !== authUser?.id) {
      return res.status(403).json({ error: "No autorizado" });
    }
    if (existing.statusId != null && REFUGIO_MANAGED.has(existing.statusId)) {
      return res.status(403).json({
        error:
          "Esta mascota está en proceso de adopción y la gestiona el refugio. Ya no puede editarse desde tu cuenta.",
      });
    }
  } else {
    const owner =
      existing.userId != null
        ? await userRepo().findOneBy({ id: existing.userId })
        : null;
    const ownerIsAdmin = owner?.roleId === CatalogIds.userRole.admin;
    // adminManageOnly (solo modera estado, no reescribe contenido) aplica ÚNICAMENTE
    // a publicaciones de un usuario común sin dueño verificado. Las mascotas
    // institucionales del refugio (userId == null) y las de otro admin se editan
    // por completo —imprescindible para cargar vacunas/tratamiento mientras se
    // preparan para la adopción—.
    if (!existing.isOwner && existing.userId != null && !ownerIsAdmin) {
      adminManageOnly = true;
    }
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

  // isOwner nunca se modifica por update (solo vía approveClaim).
  const data = { ...(parsed.data as any) };
  delete data.isOwner;

  // si no es admin, evitamos que modifique el reportStatus
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

  // Recordar el publicador original para notificarlo si el admin edita contenido.
  const originalUserId = existing.userId;
  let wasUserContent = false;
  if (originalUserId != null) {
    const originalOwner = await userRepo().findOneBy({ id: originalUserId });
    wasUserContent = originalOwner != null && originalOwner.roleId !== CatalogIds.userRole.admin;
  }
  const isAdminEditingUserContent =
    isAdmin && wasUserContent && Object.keys(data).length > 0;

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

  // Si la mascota tiene dueño verificado, no puede pasar a "en adopción"
  if (
    existing.isOwner &&
    catalogIds.statusId != null &&
    catalogIds.statusId === CatalogIds.petStatus.adopcion
  ) {
    return res.status(409).json({
      error:
        "Esta mascota tiene dueño verificado; no se puede poner en adopción. Usá 'Confirmar devolución' cuando aparezca.",
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

  const wasLost = existing.statusId === CatalogIds.petStatus.perdido;
  const newStatusId = catalogIds?.statusId !== undefined && catalogIds.statusId !== null
    ? catalogIds.statusId
    : existing.statusId;
  const isAppearing = wasLost && newStatusId !== CatalogIds.petStatus.perdido;

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
  const beforeRefugioId = updated.refugioId;
  stampRefugioIfManaged(updated, req.authUser);
  if (updated.refugioId !== beforeRefugioId) {
    await repo().save(updated);
  }
  const reloaded = await repo().findOneByOrFail({ id: updated.id });
  const catalogValuesById = await getCatalogValuesById();

  if (isAppearing && reloaded.userId != null) {
    const owner = await userRepo().findOneBy({ id: reloaded.userId });
    if (owner) {
      const newStatusLabel = catalogValuesById.get(reloaded.statusId)?.label ?? "Encontrado";

      // Notificar al dueño
      await notify(owner.id, {
        type: "publication",
        title: "¡Tu mascota apareció!",
        body: `La publicación de "${reloaded.name ?? "tu mascota"}" cambió a estado "${newStatusLabel}". Comunicate con el refugio para coordinar el reencuentro.`,
        link: `/mascotas-perdidas/${reloaded.id}`,
      });

      // Crear mensaje en el chat con los admins y notificarlos
      const msgContent = [
        `🔔 LA MASCOTA RECLAMADA HA APARECIDO`,
        ``,
        `Mascota: ${reloaded.name ?? "sin nombre"}`,
        `Link: /mascotas-perdidas/${reloaded.id}`,
        ``,
        `— Datos del dueño —`,
        `Nombre: ${owner.name}`,
        `Email: ${owner.email}`,
        ``,
        `La mascota cambió de estado de "Perdido" a "${newStatusLabel}".`,
        `Coordinar el reencuentro y la entrega.`,
      ].join("\n");

      const admins = await userRepo().find({
        where: { roleId: CatalogIds.userRole.admin },
      });
      const messageRepository = dbManager().getRepository(Message);
      for (const admin of admins) {
        const msg = messageRepository.create({
          senderId: owner.id,
          receiverId: admin.id,
          content: msgContent,
          photo: null,
          read: false,
        });
        await messageRepository.save(msg);

        await notify(admin.id, {
          type: "message",
          title: `🔔 Apareció mascota: ${reloaded.name ?? "mascota"} – ${owner.name}`,
          body: `La mascota reclamada cambió a estado "${newStatusLabel}". Respondé desde Mensajes.`,
          link: `/admin/mensajes?user=${owner.id}`,
        });
      }
    }
  }

  // Si el admin editó contenido de una publicación de usuario común con dueño verificado, notificar
  if (isAdminEditingUserContent) {
    await notify(originalUserId!, {
      type: "publication",
      title: `📝 ${reloaded.name ?? "Tu publicación"} fue actualizada por el refugio`,
      body: `El refugio enriqueció los datos de la publicación. Revisala para estar al tanto.`,
      link: `/mascotas-perdidas/${reloaded.id}`,
    });
  }

  // (Opción A: el dueño verificado no edita; solo el admin/refugio. El aviso al
  // publicador original ya se maneja arriba en isAdminEditingUserContent.)

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
  // Mismos estados de refugio que en updateMascota: en proceso de adopción las
  // fotos las gestiona solo el refugio.
  const REFUGIO_MANAGED = new Set<number>([
    CatalogIds.petStatus.transito,
    CatalogIds.petStatus.medico,
    CatalogIds.petStatus.adopcion,
    CatalogIds.petStatus.adoptado,
    CatalogIds.petStatus.devueltaAlDueno,
  ]);
  if (!isAdmin) {
    // Opción A: verificada → solo admin; sin verificar → solo el publicador original.
    if (existing.isOwner) {
      return res.status(403).json({
        error: "Esta publicación ya fue verificada por el refugio. Solo el refugio puede editar las fotos.",
      });
    }
    if (!authUser || authUser.id !== existing.userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
    if (existing.statusId != null && REFUGIO_MANAGED.has(existing.statusId)) {
      return res.status(403).json({
        error:
          "Esta mascota está en proceso de adopción y la gestiona el refugio. Ya no puede editarse desde tu cuenta.",
      });
    }
  } else {
    const owner =
      existing.userId != null
        ? await userRepo().findOneBy({ id: existing.userId })
        : null;
    const ownerIsAdmin = owner?.roleId === CatalogIds.userRole.admin;
    // El admin edita fotos de publicaciones verificadas, institucionales del
    // refugio (userId == null) o de otro admin. Solo NO reescribe las fotos de
    // un reporte de usuario común sin verificar (ahí solo modera).
    if (!existing.isOwner && existing.userId != null && !ownerIsAdmin) {
      return res.status(403).json({
        error:
          "Las fotos de publicaciones de usuarios sin verificar no se editan, solo se moderan",
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
  existing.expiresAt = null; // publicación cerrada: ya no vence
  const saved = await repo().save(existing);

  // Notificar a todos los admins para que sepan que el dueño marcó "apareció"
  const admins = await userRepo().find({
    where: { roleId: CatalogIds.userRole.admin },
  });
  for (const admin of admins) {
    await notify(admin.id, {
      type: "publication",
      title: `${existing.name ?? "Mascota"} fue marcada como "aparecida"`,
      body: `El dueño confirmó que la mascota apareció. Podés coordinar la entrega si es necesario.`,
      link: `/mascotas-perdidas/${existing.id}`,
    });
  }

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
  stampRefugioIfManaged(existing, req.authUser);
  existing.expiresAt = null; // publicación cerrada: ya no vence
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
    await dbManager().transaction(async (manager) => {
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
/**
 * Renueva (extiende) el vencimiento de una publicación. Pueden hacerlo el admin,
 * el publicador original o el dueño verificado. Resetea expiresAt según el estado.
 */
export async function renewMascota(req: Request, res: Response) {
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
  const isPublisher = authUser != null && existing.userId === authUser.id;
  const isVerifiedOwner =
    authUser != null && existing.ownerUserId != null && existing.ownerUserId === authUser.id;
  if (!isAdmin && !isPublisher && !isVerifiedOwner) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const nextExpiry = expiryFromStatus(existing.statusId, new Date());
  if (!nextExpiry) {
    return res
      .status(409)
      .json({ error: "Esta publicación está finalizada y no se puede renovar." });
  }

  existing.expiresAt = nextExpiry;
  existing.expiryNotifiedAt = null; // re-armar el aviso de "venció" para el nuevo período
  existing.expiryWarnedAt = null; // re-armar el aviso previo de "está por vencer"
  await repo().save(existing);

  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeMascota(existing, catalogValuesById));
}

/**
 * Barrido de vencimientos. Dos avisos por la campana (cada uno UNA sola vez):
 *   1. PREVIO: faltan ≤ EXPIRY_WARN_DAYS para vencer ("está por vencer").
 *   2. VENCIÓ: ya pasó la fecha.
 * No borra ni archiva en DB: el ocultamiento al público es lazy (listMascotas /
 * getMascota). Se corre periódicamente.
 */
export async function notifyExpiredPublications(): Promise<void> {
  try {
    const now = new Date();
    const activo = CatalogIds.petReportStatus.activo;

    // Avisa al publicador y al dueño verificado (si hay).
    const avisar = async (pet: Pet, title: string, body: string) => {
      const destinatarios = new Set<number>();
      if (Number.isInteger(pet.userId)) destinatarios.add(pet.userId as number);
      if (Number.isInteger(pet.ownerUserId))
        destinatarios.add(pet.ownerUserId as number);
      for (const uid of destinatarios) {
        await notify(uid, {
          type: "publication",
          title,
          body,
          link: `/mascotas-perdidas/${pet.id}`,
        });
      }
    };

    // 1) Aviso PREVIO: vence dentro de EXPIRY_WARN_DAYS y todavía no se avisó.
    const warnLimit = new Date(now.getTime() + EXPIRY_WARN_DAYS * DAY_MS);
    const porVencer = await repo()
      .createQueryBuilder("p")
      .where("p.expiresAt IS NOT NULL")
      .andWhere("p.expiresAt > :now", { now })
      .andWhere("p.expiresAt <= :limit", { limit: warnLimit })
      .andWhere("p.expiryWarnedAt IS NULL")
      .andWhere("p.reportStatusId = :activo", { activo })
      .getMany();

    for (const pet of porVencer) {
      const dias = Math.max(
        1,
        Math.ceil((new Date(pet.expiresAt!).getTime() - now.getTime()) / DAY_MS),
      );
      await avisar(
        pet,
        `⏳ Tu publicación de ${pet.name ?? "una mascota"} vence pronto`,
        `Vence en ${dias} día${dias === 1 ? "" : "s"}. Renovala para que siga visible.`,
      );
      pet.expiryWarnedAt = now;
      await repo().save(pet);
    }

    // 2) Aviso de YA venció: pasó la fecha y todavía no se avisó.
    const vencidas = await repo()
      .createQueryBuilder("p")
      .where("p.expiresAt IS NOT NULL")
      .andWhere("p.expiresAt < :now", { now })
      .andWhere("p.expiryNotifiedAt IS NULL")
      .andWhere("p.reportStatusId = :activo", { activo })
      .getMany();

    for (const pet of vencidas) {
      await avisar(
        pet,
        `⏳ Tu publicación de ${pet.name ?? "una mascota"} venció`,
        "Renovala para que vuelva a aparecer en las búsquedas; si no, dejará de mostrarse al público.",
      );
      pet.expiryNotifiedAt = now;
      await repo().save(pet);
    }

    if (porVencer.length > 0 || vencidas.length > 0) {
      console.log(
        `[expiry] avisos: ${porVencer.length} por vencer, ${vencidas.length} vencidas`,
      );
    }
  } catch (e) {
    console.warn("[expiry] barrido fallo:", (e as Error).message);
  }
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

  if (!claimantName) {
    return res.status(400).json({ error: "Nombre es requerido." });
  }
  // El mensaje explicando por qué reclama la mascota es obligatorio.
  if (typeof description !== "string" || description.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "Contanos por qué creés que la mascota es tuya." });
  }
  // Si el usuario está autenticado, el teléfono se toma de su cuenta; no es requerido en el body.
  if (!req.authUser?.id && !claimantPhone) {
    return res.status(400).json({ error: "Teléfono es requerido." });
  }

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }


  // Validate pet existence
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });


  // Si el reclamo ya fue APROBADO (admin lo verificó), no aceptar más reclamos.
  if (existing.isOwner) {
    return res.status(409).json({ error: "Esta mascota ya tiene un dueño verificado por el refugio." });
  }

  // Anti-spam: si el mismo usuario autenticado ya reclamó esta mascota, no permitir duplicados.
  if (req.authUser?.id) {
    const prevClaim = await noteRepo().findOne({
      where: { petId: existing.id },
      order: { createdAt: "DESC" },
    });
    // Buscamos si existe alguna nota de reclamo del mismo usuario
    const userTag = `Usuario ID: ${req.authUser.id}`;
    const allNotes = await noteRepo().find({ where: { petId: existing.id } });
    const alreadyClaimed = allNotes.some((n) => n.text.includes(userTag) && n.text.startsWith("🔔 RECLAMO"));
    if (alreadyClaimed) {
      return res.status(409).json({ error: "Ya enviaste un reclamo para esta mascota. El refugio lo está revisando." });
    }
    // Suppress unused variable warning
    void prevClaim;
  }

  // El reclamo queda pendiente de validación por un admin.

  // Fotos de prueba (opcionales): el reclamante adjunta evidencia de propiedad.
  const proofFiles = (req as any).files as Express.Multer.File[] | undefined;
  // Las fotos de prueba son obligatorias para reclamar.
  if (!Array.isArray(proofFiles) || proofFiles.length === 0) {
    return res
      .status(400)
      .json({ error: "Subí al menos una foto que pruebe que la mascota es tuya." });
  }
  const proofUrls: string[] = [];
  if (Array.isArray(proofFiles) && proofFiles.length > 0) {
    const bucket = process.env.MINIO_BUCKET ?? "report-images";
    for (const f of proofFiles) {
      try {
        const url = await uploadFileToMinio(
          bucket,
          `claims/${existing.id}`,
          f.originalname,
          f.buffer,
          f.mimetype,
        );
        proofUrls.push(url);
      } catch (e) {
        console.warn("[claim] no se pudo subir foto de prueba:", (e as Error).message);
      }
    }
  }

  // Nota de respaldo en la publicación
  const noteText = [
    `🔔 RECLAMO de ${claimantName}`,
    claimantPhone ? `Tel: ${claimantPhone}` : null,
    claimantEmail ? `Email: ${claimantEmail}` : null,
    description ? `Mensaje: ${description}` : null,
    proofUrls.length ? `Fotos de prueba: ${proofUrls.join(" | ")}` : null,
    req.authUser?.id ? `Usuario ID: ${req.authUser.id}` : null,
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
    ...(claimantPhone ? [`Teléfono: ${claimantPhone}`] : []),
    ...(claimantEmail ? [`Email: ${claimantEmail}`] : []),
    ...(description ? [`Motivo: ${description}`] : []),
    ...(req.authUser?.id ? [`Usuario ID: ${req.authUser.id}`] : []),
    ...(proofUrls.length
      ? [``, `— Fotos de prueba (${proofUrls.length}) —`, ...proofUrls]
      : []),
    ``,
    `— Situación —`,
    existing.userId
      ? `✅ Dueño asignado: ${ownerName ?? "ID " + existing.userId}`
      : `⚠️ Sin dueño registrado (reclamo sin cuenta)`,
    ``,
    existing.userId
      ? `El dueño ya está vinculado a la publicación y puede marcarla como "apareció" desde su cuenta.`
      : `El reclamante no tiene cuenta; contactar por teléfono/email.`,
    ``,
    `Respondé a este mensaje para coordinar el reencuentro.`,
  ].join("\n");

  // Obtener admins
  const admins = await userRepo().find({
    where: { roleId: CatalogIds.userRole.admin },
  });
  const messageRepo = dbManager().getRepository(Message);

  // Aviso a los admins: best-effort. La nota del reclamo ya quedó guardada, así
  // que un fallo acá (p. ej. una sesión vieja cuyo usuario ya no existe) NO debe
  // tumbar el reclamo con un 500.
  try {
    if (req.authUser?.id) {
      // Usuario autenticado: mensaje del reclamante a cada admin.
      const senderExists = await userRepo().findOneBy({ id: req.authUser.id });
      for (const admin of admins) {
        if (senderExists) {
          const msg = messageRepo.create({
            senderId: req.authUser.id,
            receiverId: admin.id,
            content: msgContent,
            photo: proofUrls[0] ?? null,
            read: false,
          });
          await messageRepo.save(msg);
        }

        await notify(admin.id, {
          type: "message",
          title: `🔔 Reclamo: ${existing.name ?? "mascota"} – ${claimantName}`,
          body: `Reclama ser el dueño. ${existing.userId ? "Dueño asignado." : "Sin cuenta."} Respondé desde Mensajes.`,
          link: `/admin/mensajes?user=${req.authUser.id}`,
        });
      }
    } else {
      // Sin cuenta: solo notificaciones (no hay con quién abrir conversación).
      for (const admin of admins) {
        await notify(admin.id, {
          type: "publication",
          title: `🔔 Reclamo de mascota: ${existing.name ?? "sin nombre"}`,
          body: `${claimantName} reclama ser el dueño (sin cuenta).${claimantPhone ? ` Tel: ${claimantPhone}.` : ""}`,
          link: `/mascotas-perdidas/${existing.id}`,
        });
      }
    }
  } catch (e) {
    console.warn("[claim] no se pudo avisar a los admins:", (e as Error).message);
  }

    res.json({
      ok: true,
      message: "Reclamo registrado. El refugio se comunicará con vos.",
    });
}

/**
 * Aprobar reclamo: el admin verifica la evidencia y confirma que el reclamante
 * es el dueño legítimo. Activa el badge "con dueño" (isOwner), asigna ownerUserId
 * (sin pisar el userId del publicador original) y notifica a todas las partes.
 * No cierra la publicación; eso ocurre cuando el admin usa confirm-return.
 *
 * El ownerUserId se detecta automáticamente de los reclamos (notas "🔔 RECLAMO").
 * Si el reclamo fue de un usuario autenticado, el campo "Usuario ID: X" está en la nota.
 * Si no, el admin debe indicarlo manualmente.
 */
export async function approveClaim(req: Request, res: Response) {
  const id = req.params.id;
  const { adminNote } = req.body ?? {};

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  if (existing.isOwner) {
    return res.status(409).json({ error: "Esta mascota ya tiene un dueño verificado." });
  }

  // Auto-detectar ownerUserId desde las notas de reclamo
  const allNotes = await noteRepo().find({
    where: { petId: existing.id },
    order: { createdAt: "DESC" },
  });
  const claimNotes = allNotes.filter((n) => n.text.startsWith("🔔 RECLAMO"));
  let ownerUserId: number | null = null;
  for (const note of claimNotes) {
    const match = note.text.match(/Usuario ID:\s*(\d+)/);
    if (match) {
      ownerUserId = Number(match[1]);
      break;
    }
  }

  // Guardar referencias antes de la transacción
  const originalPublisherUserId = existing.userId;

  await dbManager().transaction(async (manager) => {
    const petRepo = manager.getRepository(Pet);
    const noteRepoM = manager.getRepository(PetNote);

    // Activar badge y asignar dueño (sin pisar userId del publicador original)
    existing.isOwner = true;
    if (ownerUserId) {
      existing.ownerUserId = ownerUserId;
    }
    await petRepo.save(existing);

    // Nota de auditoría del admin
    const adminId = req.authUser?.id ?? null;
    let adminName: string | null = null;
    if (adminId) {
      const admin = await userRepo().findOneBy({ id: adminId });
      adminName = admin?.name ?? admin?.email ?? null;
    }
    const noteContent = [
      `✅ Reclamo APROBADO por ${adminName ?? "admin"}.`,
      ownerUserId ? `Dueño verificado: usuario ID ${ownerUserId}.` : "Sin usuario vinculado (reclamo sin cuenta).",
      `Publicación del usuario: ${originalPublisherUserId ?? "anónimo"}.`,
      adminNote ? `Nota: ${adminNote}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    await noteRepoM.save(
      noteRepoM.create({
        petId: existing.id,
        authorId: adminId,
        authorName: adminName,
        text: noteContent,
        kindId: CatalogIds.petNoteKind.general,
      }),
    );
  });

  // Notificar al dueño recién verificado
  if (ownerUserId) {
    await notify(ownerUserId, {
      type: "publication",
      title: `✅ Tu reclamo de ${existing.name ?? "la mascota"} fue aprobado`,
      body: `El refugio confirmó que sos el dueño. Ya figura en "Mis publicaciones". Cuando aparezca, el refugio coordina la devolución con vos.`,
      link: `/mascotas-perdidas/${existing.id}`,
    });
  }

  // Notificar al publicador original
  if (originalPublisherUserId != null && ownerUserId !== originalPublisherUserId) {
    await notify(originalPublisherUserId, {
      type: "publication",
      title: `🐾 ${existing.name ?? "Una mascota"} de tu publicación tiene dueño`,
      body: `El refugio verificó que la mascota tiene dueño. Si el dueño edita la publicación, se te notificará. La publicación sigue activa.`,
      link: `/mascotas-perdidas/${existing.id}`,
    });
  }

  return res.json({ ok: true, message: "Reclamo aprobado. Badge 'con dueño' activado." });
}

/**
 * Rechazar reclamo: el admin determina que el reclamante NO es el dueño legítimo.
 * Registra una nota en la publicación, envía un mensaje al reclamante vía chat
 * y lo notifica. No afecta el estado de la mascota ni de la publicación.
 */
export async function rejectClaim(req: Request, res: Response) {
  const id = req.params.id;
  const { reason } = req.body ?? {};

  let existing;
  try {
    existing = await repo().findOneBy({ id });
  } catch {
    return res.status(400).json({ error: "Id invalido" });
  }
  if (!existing) return res.status(404).json({ error: "Pet no encontrada" });

  // Auto-detectar el usuario que reclamó desde las notas de reclamo
  const allNotes = await noteRepo().find({
    where: { petId: existing.id },
    order: { createdAt: "DESC" },
  });
  const claimNotes = allNotes.filter((n) => n.text.startsWith("🔔 RECLAMO"));
  const latestClaimNote = claimNotes[0];
  let claimantUserId: number | null = null;
  let claimantName: string | null = null;
  if (latestClaimNote) {
    const match = latestClaimNote.text.match(/Usuario ID:\s*(\d+)/);
    if (match) {
      claimantUserId = Number(match[1]);
    }
    // Extraer nombre del reclamante del formato "🔔 RECLAMO de <nombre>"
    const nameMatch = latestClaimNote.text.match(/🔔 RECLAMO de (.+)/);
    if (nameMatch) {
      claimantName = nameMatch[1].trim();
    }
  }

  const adminId = req.authUser?.id ?? null;
  let adminName: string | null = null;
  if (adminId) {
    const admin = await userRepo().findOneBy({ id: adminId });
    adminName = admin?.name ?? admin?.email ?? null;
  }

  // Nota de auditoría en la publicación
  const noteContent = [
    `❌ Reclamo RECHAZADO por ${adminName ?? "admin"}.`,
    claimantName ? `Reclamante: ${claimantName}` : null,
    claimantUserId ? `Usuario ID: ${claimantUserId}` : null,
    reason ? `Motivo: ${reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await noteRepo().save(
    noteRepo().create({
      petId: existing.id,
      authorId: adminId,
      authorName: adminName,
      text: noteContent,
      kindId: CatalogIds.petNoteKind.general,
    }),
  );

  // Enviar mensaje al reclamante (si tiene cuenta) y notificarlo
  if (claimantUserId) {
    try {
      const messageRepo = AppDataSource.getRepository(Message);
      const msg = messageRepo.create({
        senderId: adminId ?? 0,
        receiverId: claimantUserId,
        content: [
          `❌ Tu reclamo de "${existing.name ?? "la mascota"}" fue rechazado.`,
          reason ? `Motivo: ${reason}` : null,
          ``,
          `Si creés que hay un error, contactanos nuevamente con más información.`,
        ]
          .filter(Boolean)
          .join("\n"),
        photo: null,
        read: false,
      });
      await messageRepo.save(msg);

      await notify(claimantUserId, {
        type: "message",
        title: `❌ Reclamo rechazado: ${existing.name ?? "mascota"}`,
        body: reason ?? "El refugio rechazó tu reclamo. Revisá el chat para más detalles.",
        link: `/admin/mensajes?user=${claimantUserId}`,
      });
    } catch (e) {
      console.warn("[rejectClaim] no se pudo notificar al reclamante:", (e as Error).message);
    }
  }


  // Marcar la nota original como rechazada para que no reaparezca en el carrusel
  if (latestClaimNote) {
    latestClaimNote.text = "[RECHAZADO] " + latestClaimNote.text;
    await noteRepo().save(latestClaimNote);
  }

  return res.json({ ok: true, message: "Reclamo rechazado." });
}

/**
 * Confirmar devolución: el admin verifica el reclamo y marca la mascota
 * como devuelta al dueño. Cierra la publicación y cancela adopciones activas.
 */
export async function confirmReturn(req: Request, res: Response) {
  const id = req.params.id;
  const { returnedTo } = req.body ?? {};

  // Si el admin está autenticado, no requiere nombre; se registra como devolución por el refugio.
  const isAdmin = req.authUser?.role === "admin";
  const finalReturnedTo = (isAdmin ? "Refugio" : returnedTo);
  if (!finalReturnedTo || typeof finalReturnedTo !== "string") {
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
  await dbManager().transaction(async (manager) => {
    const petRepo = manager.getRepository(Pet);
    const adoptionRepo = manager.getRepository(Adoption);
    const followupRepo = manager.getRepository(Followup);
    const noteRepo = manager.getRepository(PetNote);

    // Cambiar estado
    existing.statusId = S.devueltaAlDueno;
    existing.reportStatusId = CatalogIds.petReportStatus.finalizado;
    existing.expiresAt = null; // publicación cerrada: ya no vence
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
    const finalReturnedToText = isAdmin ? (adminName ?? "Refugio") : returnedTo;
    await noteRepo.save(
      noteRepo.create({
        petId: existing.id,
        authorId: adminId,
        authorName: adminName,
        text: `✅ Devuelta al dueño: entregada a ${finalReturnedToText}${adminName ? ` por ${adminName}` : ""}. Reclamo gestionado por el refugio.`,
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

  // Notificar al dueño verificado cuando la mascota aparece
  if (reloaded.ownerUserId != null) {
    const verifiedOwner = await userRepo().findOneBy({ id: reloaded.ownerUserId });
    if (verifiedOwner) {
      await notify(verifiedOwner.id, {
        type: "publication",
        title: `🔔 ${reloaded.name ?? "Tu mascota"} fue marcada como devuelta al dueño`,
        body: `El refugio confirmó la devolución. Coordiná el reencuentro si es necesario.`,
        link: `/mascotas-perdidas/${reloaded.id}`,
      });
    }
  }

  // Cerrar el caso con quien(es) reclamaron: mensaje automático en el chat +
  // notificación, así la otra parte ve el cierre (no solo el cartel del admin).
  // Best-effort: no debe romper la respuesta principal.
  try {
    const adminId = req.authUser?.id;
    if (adminId) {
      const allNotes = await noteRepo().find({ where: { petId: id } });
      const claimantIds = new Set<number>();
      for (const n of allNotes) {
        const m = n.text.match(/Usuario ID:\s*(\d+)/);
        if (m && n.text.includes("🔔 RECLAMO")) claimantIds.add(Number(m[1]));
      }
      const messageRepo = dbManager().getRepository(Message);
      for (const cid of claimantIds) {
        if (cid === adminId) continue;
        const exists = await userRepo().findOneBy({ id: cid });
        if (!exists) continue;
        await messageRepo.save(
          messageRepo.create({
            senderId: adminId,
            receiverId: cid,
            content: `✅ Confirmamos la devolución de ${reloaded.name ?? "la mascota"}. ¡Gracias por avisar! Cerramos la publicación.`,
            photo: null,
            read: false,
          }),
        );
        await notify(cid, {
          type: "message",
          title: `✅ Devolución confirmada: ${reloaded.name ?? "mascota"}`,
          body: "El refugio confirmó la devolución. Revisá el chat.",
          link: `/account?tab=messages&user=${adminId}`,
        });
      }
    }
  } catch (e) {
    console.warn("[confirmReturn] no se pudo avisar al reclamante:", (e as Error).message);
  }

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
