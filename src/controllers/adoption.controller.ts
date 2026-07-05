import { Request, Response } from "express";
import { In, IsNull, Not, SelectQueryBuilder } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Adoption } from "../entity/Adoption.js";
import { Followup } from "../entity/Followup.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { Message } from "../entity/Message.js";
import { AdoptionCheck } from "../entity/AdoptionCheck.js";
import { AdoptionNote } from "../entity/AdoptionNote.js";
import {
  adoptionSchema,
  AdoptionInput,
  adoptionStatusUpdateSchema,
  AdoptionStatusUpdateInput,
} from "../schemas/adoption.schema.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { Catalog, CatalogIds, CatalogName } from "../lib/catalog-constants.js";
import {
  applyTenantScope,
  stampRefugioIfManaged,
  tenantWhere,
} from "../lib/tenant.js";
import {
  getAdoptionStatusCode,
  parseStatusId,
  adoptionStatusEntries,
  adoptionStatusByCode,
  allowedNextAdoptionStatuses,
  isTerminalAdoptionStatus,
  type AdoptionStatusCode,
} from "../lib/adoption-status.js";
import {
  parseOptionalInt,
  parseOptionalNumber,
  parsePagination,
} from "../lib/query-utils.js";
import { serializeAdoption } from "../lib/serializers.js";
import { calculateCompatibility } from "../lib/matching.js";
import { notify } from "../lib/notify.js";
import { recordActivity } from "../lib/activity.js";

// Etiquetas amigables por código de estado (para las notificaciones).
const ADOPTION_STATUS_LABELS: Record<string, string> = {
  NUEVA: "Nueva",
  EN_EVALUACION: "En evaluación",
  ENTREVISTA_PENDIENTE: "Entrevista pendiente",
  ACEPTADA_CON_SEGUIMIENTO: "Aceptada con seguimiento",
  ACEPTADA: "Aceptada",
  DESCARTADA: "Descartada",
};

function adoptionRepo() {
  return dbManager().getRepository(Adoption);
}

function userRepo() {
  return dbManager().getRepository(User);
}

function petRepo() {
  return dbManager().getRepository(Pet);
}

function followupRepo() {
  return dbManager().getRepository(Followup);
}

function checkRepo() {
  return dbManager().getRepository(AdoptionCheck);
}

function adoptionNoteRepo() {
  return dbManager().getRepository(AdoptionNote);
}

function messageRepo() {
  return dbManager().getRepository(Message);
}

/**
 * Al crear una solicitud, el usuario pasa a Adoptante y se HABILITA el chat con
 * el refugio: sembramos un primer mensaje automático del admin del refugio hacia
 * el adoptante para que la conversación quede abierta en ambas bandejas.
 * (Entrega 3 — "Nueva: el usuario pasa a Adoptante y se habilita el chat".)
 */
async function seedAdoptionChat(adoption: Adoption, pet: Pet | null) {
  // Solo si hay un usuario real detrás de la solicitud (no invitado/anónimo).
  if (!adoption.userId) return;

  // Admin del refugio dueño de la publicación; si no hay refugio, cualquier admin.
  const admin = await userRepo().findOne({
    where:
      adoption.refugioId != null
        ? { roleId: CatalogIds.userRole.admin, refugioId: adoption.refugioId }
        : { roleId: CatalogIds.userRole.admin },
  });
  if (!admin || admin.id === adoption.userId) return;

  const petName = pet?.name ? `"${pet.name}"` : "la mascota";
  const nombre = adoption.firstName || "";
  const msg = messageRepo().create({
    senderId: admin.id,
    receiverId: adoption.userId,
    content:
      `¡Hola${nombre ? ` ${nombre}` : ""}! Recibimos tu solicitud de adopción de ${petName}. ` +
      `Este es el chat con el refugio: podés escribirnos por acá para coordinar la entrevista y cualquier duda del proceso.`,
    photo: null,
    read: false,
  });
  await messageRepo().save(msg);

  await notify(adoption.userId, {
    type: "message",
    title: `Nuevo mensaje de ${admin.name}`,
    body: `Se abrió el chat de tu solicitud de adopción de ${petName}.`,
    link: `/account?tab=messages&user=${admin.id}`,
  });
}

// Checklist de evaluación del adoptante (orden fijo).
export const EVAL_CHECKLIST = [
  "Verificó identidad",
  "Consultó sobre vivienda",
  "Evaluó experiencia previa",
  "Revisó situación familiar",
  "Coordinó visita al hogar",
];

// Qué ítems del checklist se exigen para habilitar cada transición.
function requiredChecksFor(statusId: number): string[] {
  const A = CatalogIds.adoptionStatus;
  if (statusId === A.entrevistaPendiente)
    return ["Verificó identidad", "Consultó sobre vivienda"];
  if (statusId === A.aceptadaConSeguimiento) return EVAL_CHECKLIST; // completo
  return [];
}

async function createFollowupsForAdoption(
  adoption: Adoption,
  actorUserId: number | null = null,
) {
  const petId = adoption.petId;
  const userId = adoption.userId; // adoptante (persona interesada)
  if (!petId || typeof userId !== "number" || !Number.isInteger(userId)) return;

  // Responsable = el admin/refugio que aprueba la adopción (no el adoptante).
  // Si por algún motivo no hay actor (flujo sin sesión), cae al adoptante.
  const responsableId = actorUserId ?? userId;

  const baseDate = new Date();
  const offsets = [7, 30, 90];
  const followups = offsets.map((days) => {
    const appointmentAt = new Date(baseDate);
    appointmentAt.setDate(appointmentAt.getDate() + days);

    const followup = new Followup();
    followup.petId = petId;
    followup.userId = responsableId; // responsable (admin)
    followup.adopterUserId = userId; // adoptante (usuario)
    followup.typeId = CatalogIds.followupType.postAdopcion;
    followup.statusId = CatalogIds.followupStatus.pendiente;
    followup.appointmentAt = appointmentAt;
    followup.refugioId = adoption.refugioId ?? null;
    return followup;
  });

  const saved = await followupRepo().save(followups);

  // Registrar actividad (métricas + aviso a admins), igual que el alta manual.
  await recordActivity({
    type: "seguimiento",
    title: "Seguimientos post-adopción agendados",
    actorUserId,
    refugioId: adoption.refugioId ?? null,
    refType: "followup",
    refId: saved[0]?.id ?? null,
    link: "/admin/seguimientos",
  });

  // Avisar al adoptante que quedaron programados sus seguimientos.
  await notify(userId, {
    type: "adoption_status",
    title: "Se programaron tus seguimientos post-adopción",
    body: `Agendamos ${saved.length} seguimientos (a los ${offsets.join(", ")} días).`,
    link: "/account",
  });

  return saved;
}

async function serializeAdoptionDetail(adoption: Adoption) {
  const catalogValuesById = await getCatalogValuesById();
  const adopted = serializeAdoption(adoption, catalogValuesById);
  const user = adoption.userId
    ? await userRepo().findOneBy({ id: adoption.userId })
    : null;
  const pet = adoption.petId
    ? await petRepo().findOneBy({ id: adoption.petId })
    : null;

  let compatibilityFactors: { label: string; isPositive: boolean }[] = [];
  if (pet) {
    compatibilityFactors = calculateCompatibility(adoption, pet).factors;
  }

  return {
    ...adopted,
    compatibilityFactors,
    applicant: {
      firstName: adoption.firstName,
      lastName: adoption.lastName,
      email: adoption.email,
      phone: adoption.phone,
    },
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          photo: user.photo,
        }
      : null,
    pet: pet
      ? {
          id: pet.id,
          name: pet.name,
          photo: pet.photos?.[0] ?? pet.photo,
          animalTypeId: pet.animalTypeId,
          statusId: pet.statusId,
          reportStatusId: pet.reportStatusId,
        }
      : null,
    messages: [],
    history: [],
    files: [],
  };
}

type AdoptionSortField =
  | "createdAt"
  | "updatedAt"
  | "compatibilityScore"
  | "statusId"
  | "firstName"
  | "lastName"
  | "town"
  | "adults"
  | "children";

type SortDirection = "ASC" | "DESC";

type SortOrder = {
  column: string;
  direction: SortDirection;
};

// Acepta tanto los nombres canónicos como los alias que manda la tabla del
// front (SolicitudesTable usa: compat, estado, fecha, fechaModificacion, userName).
const adoptionSortFieldMap: Record<string, string> = {
  createdAt: "adoption.createdAt",
  updatedAt: "adoption.updatedAt",
  compatibilityScore: "adoption.compatibilityScore",
  statusId: "adoption.statusId",
  firstName: "adoption.firstName",
  lastName: "adoption.lastName",
  town: "adoption.town",
  adults: "adoption.adults",
  children: "adoption.children",
  // Alias del front:
  compat: "adoption.compatibilityScore",
  estado: "adoption.statusId",
  fecha: "adoption.createdAt",
  fechaModificacion: "adoption.updatedAt",
  userName: "adoption.firstName",
  // "petName" no se ordena server-side: el nombre de la mascota vive en otra
  // tabla y joinearlo rompe la paginación con DISTINCT de TypeORM. La columna
  // se marca como NO ordenable en el front (SolicitudesTable).
};

function normalizeSortDirection(value: unknown): SortDirection {
  if (typeof value !== "string") return "DESC";
  const normalized = value.trim().toUpperCase();
  return normalized === "ASC" ? "ASC" : "DESC";
}

function parseSort(req: Request): SortOrder[] {
  const sortParam = req.query.sort;
  let raw: string;

  if (Array.isArray(sortParam)) {
    raw = typeof sortParam[0] === "string" ? sortParam[0] : "";
  } else if (typeof sortParam === "string") {
    raw = sortParam;
  } else {
    raw = "";
  }

  if (!raw.trim()) {
    return [{ column: adoptionSortFieldMap.createdAt, direction: "DESC" }];
  }

  const orders = raw
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [field, direction] = segment.split(":").map((part) => part.trim());
      const column = adoptionSortFieldMap[field as AdoptionSortField];
      if (!column) return null;
      return { column, direction: normalizeSortDirection(direction) };
    })
    .filter((value): value is SortOrder => value !== null);

  return orders.length > 0
    ? orders
    : [{ column: adoptionSortFieldMap.createdAt, direction: "DESC" }];
}

function applySort(qb: SelectQueryBuilder<any>, orders: SortOrder[]) {
  const [first, ...rest] = orders;
  let ordered = qb.orderBy(first.column, first.direction);
  for (const order of rest) {
    ordered = ordered.addOrderBy(order.column, order.direction);
  }
  // Desempate estable: con created_at empatado (p. ej. tras el seed, donde todas
  // las filas comparten now()) Postgres reordena la fila recién actualizada al
  // final del heap. Fijar el id como criterio final mantiene cada fila en su lugar.
  ordered = ordered.addOrderBy("adoption.id", "DESC");
  return ordered;
}

function buildAdoptionFilters(req: Request) {
  const userId = parseOptionalInt(req.query.userId);
  const petId =
    typeof req.query.petId === "string" ? req.query.petId.trim() : "";
  const statusId = parseStatusId(req.query.status, req.query.statusId);
  const compatibilityMin = parseOptionalNumber(req.query.compatibilityMin);
  const compatibilityMax = parseOptionalNumber(req.query.compatibilityMax);

  return {
    userId,
    petId: petId.length > 0 ? petId : undefined,
    statusId,
    compatibilityMin,
    compatibilityMax,
  };
}

async function mapAdoptionSummaries(items: Adoption[]) {
  if (items.length === 0) return [];

  const userIds = [
    ...new Set(
      items
        .map((i) => i.userId)
        .filter((id): id is number => Number.isInteger(id)),
    ),
  ];
  const petIds = [
    ...new Set(
      items
        .map((i) => i.petId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const users = userIds.length
    ? await userRepo().findBy({ id: In(userIds) })
    : [];
  const pets = petIds.length ? await petRepo().findBy({ id: In(petIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const petsById = new Map(pets.map((p) => [p.id, p]));

  // Motivo de rechazo (nota "Rechazo: ...") para las solicitudes descartadas.
  const descartadaIds = items
    .filter((i) => i.statusId === CatalogIds.adoptionStatus.descartada)
    .map((i) => i.id);
  const reasonByAdoption = new Map<number, string>();
  if (descartadaIds.length) {
    const notes = await adoptionNoteRepo()
      .createQueryBuilder("note")
      .where("note.adoptionId IN (:...ids)", { ids: descartadaIds })
      .andWhere("note.text LIKE :prefix", { prefix: "Rechazo:%" })
      .orderBy("note.createdAt", "DESC")
      .getMany();
    for (const n of notes) {
      if (!reasonByAdoption.has(n.adoptionId)) {
        reasonByAdoption.set(n.adoptionId, n.text.replace(/^Rechazo:\s*/, ""));
      }
    }
  }

  return items.map((item) => {
    const user = item.userId != null ? usersById.get(item.userId) : undefined;
    const pet = item.petId ? petsById.get(item.petId) : undefined;
    return {
      id: item.id,
      userId: item.userId,
      petId: item.petId,
      statusId: item.statusId,
      status: getAdoptionStatusCode(item.statusId) ?? "NUEVA",
      kind: item.kind ?? "adopcion",
      compatibilityScore: item.compatibilityScore ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      applicantName: `${item.firstName} ${item.lastName}`.trim(),
      applicantEmail: item.email,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      userPhoto: user?.photo ?? null,
      petName: pet?.name ?? null,
      petPhoto: pet?.photos?.[0] ?? pet?.photo ?? null,
      petAnimalTypeId: pet?.animalTypeId ?? null,
      rejectionReason: reasonByAdoption.get(item.id) ?? null,
    };
  });
}

function handleCatalogError(error: unknown, res: Response) {
  if (error instanceof CatalogValidationError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

async function resolveCatalogId(
  catalog: CatalogName,
  id: number | null | undefined,
  code: string | number | null | undefined,
  required: boolean,
) {
  return resolveCatalogValueId(catalog, { id, code }, required);
}

function normalizeYesNoNAId(id: number | null | undefined) {
  if (id === CatalogIds.yesNo.si) return CatalogIds.yesNoNA.si;
  if (id === CatalogIds.yesNo.no) return CatalogIds.yesNoNA.no;
  return id;
}

async function resolveAdoptionCatalogIds(values: AdoptionInput) {
  return {
    preferredAnimalTypeId: await resolveCatalogId(
      Catalog.ANIMAL_TYPE,
      values.preferredAnimalTypeId,
      values.preferredAnimal,
      false,
    ),
    hasGardenId: await resolveCatalogId(
      Catalog.YES_NO,
      values.hasGardenId,
      values.hasGarden,
      true,
    ),
    livingSituationId: await resolveCatalogId(
      Catalog.LIVING_SITUATION,
      values.livingSituationId,
      values.livingSituation,
      true,
    ),
    householdSettingId: await resolveCatalogId(
      Catalog.HOUSEHOLD_SETTING,
      values.householdSettingId,
      values.householdSetting,
      true,
    ),
    activityLevelId: await resolveCatalogId(
      Catalog.ACTIVITY_LEVEL,
      values.activityLevelId,
      values.activityLevel,
      true,
    ),
    visitingChildrenId: await resolveCatalogId(
      Catalog.YES_NO,
      values.visitingChildrenId,
      values.visitingChildren,
      true,
    ),
    hasFlatmatesId: await resolveCatalogId(
      Catalog.YES_NO,
      values.hasFlatmatesId,
      values.hasFlatmates,
      true,
    ),
    otherAnimalsId: await resolveCatalogId(
      Catalog.YES_NO,
      values.otherAnimalsId,
      values.otherAnimals,
      true,
    ),
    neuteredId: await resolveCatalogId(
      Catalog.YES_NO_NA,
      normalizeYesNoNAId(values.neuteredId),
      values.neutered,
      true,
    ),
    vaccinatedId: await resolveCatalogId(
      Catalog.YES_NO_NA,
      normalizeYesNoNAId(values.vaccinatedId),
      values.vaccinated,
      true,
    ),
  };
}

export async function createAdoption(req: Request, res: Response) {
  const parsed = adoptionSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const values: AdoptionInput = parsed.data;
  let catalogIds: Awaited<ReturnType<typeof resolveAdoptionCatalogIds>>;
  try {
    catalogIds = await resolveAdoptionCatalogIds(values);
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const userIdFromReq = req.authUser?.id;
  const adoption = adoptionRepo().create({
    userId: userIdFromReq ?? values.userId ?? null,
    petId: values.petId ?? null,
    statusId: CatalogIds.adoptionStatus.nueva,
    compatibilityScore: null,
    ...catalogIds,
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    addressLine1: values.addressLine1,
    addressLine2: values.addressLine2 || null,
    postcode: values.postcode,
    town: values.town,
    adults: values.adults,
    children: values.children,
    allergies: values.allergies || null,
    otherAnimalsDetail: values.otherAnimalsDetail || null,
    experience: values.experience || null,
    acceptsTerms: values.acceptsTerms,
    kind: values.kind,
  });

  let pet: Pet | null = null;
  if (adoption.petId) {
    pet = await petRepo().findOneBy({ id: adoption.petId });
    if (pet) {
      adoption.compatibilityScore = calculateCompatibility(adoption, pet).score;
      adoption.refugioId = pet.refugioId ?? null;
    }
  }

  const saved = await adoptionRepo().save(adoption);

  await recordActivity({
    type: "solicitud",
    title: `Nueva solicitud de adopción: ${pet?.name ?? "mascota"}`,
    actorUserId: saved.userId ?? null,
    refugioId: saved.refugioId ?? null,
    refType: "adoption",
    refId: saved.id,
    link: `/admin/solicitudes?requestId=${saved.id}`,
  });

  // Se habilita el chat adoptante ↔ refugio (no bloquea la respuesta si falla).
  try {
    await seedAdoptionChat(saved, pet);
  } catch (error) {
    console.error("No se pudo abrir el chat de la adopción:", error);
  }

  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json(serializeAdoption(saved, catalogValuesById));
}

/**
 * Lista las solicitudes de adopción del usuario autenticado.
 * Devuelve solo las del propio usuario con info de la mascota.
 */
export async function listMyAdoptions(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const adoptions = await adoptionRepo().find({
    where: { userId },
    order: { createdAt: "DESC" },
  });

  const catalogValuesById = await getCatalogValuesById();

  // Enriquecer con info de la mascota
  const petIds = [
    ...new Set(
      adoptions
        .map((a) => a.petId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const pets = petIds.length ? await petRepo().findBy({ id: In(petIds) }) : [];
  const petsById = new Map(pets.map((p) => [p.id, p]));

  const result = adoptions.map((adoption) => {
    const pet = adoption.petId ? petsById.get(adoption.petId) : null;
    return {
      ...serializeAdoption(adoption, catalogValuesById),
      petName: pet?.name ?? null,
      petPhoto: pet?.photo ?? pet?.photos?.[0] ?? null,
    };
  });

  res.json(result);
}

export async function listAdoptions(req: Request, res: Response) {
  const repo = adoptionRepo();
  const isAdmin = req.authUser?.role === "admin";
  if (isAdmin) {
    // Excluye los perfiles de adoptante (sin petId); solo solicitudes reales.
    const all = await repo.find({
      where: { petId: Not(IsNull()), ...tenantWhere(req.authUser) },
      order: { createdAt: "DESC" },
    });
    const catalogValuesById = await getCatalogValuesById();
    return res.json(
      all.map((item) => serializeAdoption(item, catalogValuesById)),
    );
  }

  const userId = req.authUser?.id;
  if (!Number.isInteger(userId))
    return res.status(401).json({ error: "Usuario no autenticado" });
  // Solo solicitudes reales (con mascota); el row sin petId es el "perfil de
  // adoptante", no una solicitud. Devolvemos el summary enriquecido (nombre/foto
  // de la mascota + fechas) para alimentar la vista "Mis Solicitudes".
  const items = await repo.find({
    where: { userId, petId: Not(IsNull()) },
    order: { createdAt: "DESC" },
  });
  res.json(await mapAdoptionSummaries(items));
}

export async function adminListAdoptionsPaged(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req.query);
  const filters = buildAdoptionFilters(req);
  const sortOrders = parseSort(req);

  const qb = adoptionRepo().createQueryBuilder("adoption");
  // Solo solicitudes asociadas a una mascota concreta. Las adopciones sin petId
  // son el "perfil de adoptante" (registro general del usuario) y no deben
  // aparecer como solicitudes en el panel.
  qb.andWhere("adoption.petId IS NOT NULL");
  applyTenantScope(qb, "adoption", req.authUser);
  if (filters.userId)
    qb.andWhere("adoption.userId = :userId", { userId: filters.userId });
  if (filters.petId)
    qb.andWhere("adoption.petId = :petId", { petId: filters.petId });
  if (filters.statusId)
    qb.andWhere("adoption.statusId = :statusId", {
      statusId: filters.statusId,
    });
  if (filters.compatibilityMin !== undefined) {
    qb.andWhere("adoption.compatibilityScore >= :compatibilityMin", {
      compatibilityMin: filters.compatibilityMin,
    });
  }
  if (filters.compatibilityMax !== undefined) {
    qb.andWhere("adoption.compatibilityScore <= :compatibilityMax", {
      compatibilityMax: filters.compatibilityMax,
    });
  }

  // Búsqueda de texto: filtra por nombre/apellido/email del solicitante o ciudad.
  // (petName/userName viven en otras tablas y joinearlos rompería la paginación
  // con DISTINCT de TypeORM; por eso no entran en el filtro de texto.)
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    qb.andWhere(
      "(adoption.firstName ILIKE :q OR adoption.lastName ILIKE :q OR adoption.email ILIKE :q OR adoption.town ILIKE :q)",
      { q: `%${q}%` },
    );
  }

  const ordered = applySort(qb, sortOrders);
  const [items, total] = await ordered
    .skip(skip)
    .take(pageSize)
    .getManyAndCount();

  // Los cards deben mostrar los totales por estado del conjunto completo,
  // mientras que la lista paginada aplica los filtros del query.
  const rawSummary = await adoptionRepo()
    .createQueryBuilder("adoption")
    .where("adoption.petId IS NOT NULL")
    .select("adoption.statusId", "statusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("adoption.statusId")
    .getRawMany<{ statusId: string; count: string }>();

  const statusTotals = adoptionStatusEntries.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.code] = 0;
      return acc;
    },
    {},
  );
  for (const row of rawSummary) {
    const statusId = Number(row.statusId);
    const statusCode = getAdoptionStatusCode(statusId);
    if (statusCode) statusTotals[statusCode] = Number(row.count) || 0;
  }

  res.json({
    page,
    pageSize,
    total,
    statusTotals,
    items: await mapAdoptionSummaries(items),
  });
}

export async function getAdoptionById(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  const isAdmin = req.authUser?.role === "admin";
  if (!isAdmin) {
    const userId = req.authUser?.id;
    if (!Number.isInteger(userId) || adoption.userId !== userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
  }

  res.json(await serializeAdoptionDetail(adoption));
}

export async function getMyPetCompatibility(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "No autenticado" });
  }

  const petId =
    typeof req.params.petId === "string" ? req.params.petId.trim() : "";
  if (!petId) return res.status(400).json({ error: "Mascota inválida" });

  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });

  // Preferimos la solicitud exacta si ya existe. Si no, usamos el perfil general
  // de adopción (petId null) o, como respaldo, la solicitud más reciente del usuario.
  let adoption = await adoptionRepo().findOne({
    where: { userId, petId },
    order: { createdAt: "DESC" },
  });
  let source: "application" | "profile" | "latest" = "application";

  if (!adoption) {
    adoption = await adoptionRepo().findOne({
      where: { userId, petId: IsNull() },
      order: { createdAt: "DESC" },
    });
    source = "profile";
  }

  if (!adoption) {
    adoption = await adoptionRepo().findOne({
      where: { userId },
      order: { createdAt: "DESC" },
    });
    source = "latest";
  }

  if (!adoption) {
    return res.status(404).json({
      error: "No hay perfil de adopción para calcular compatibilidad.",
    });
  }

  const compatibility = calculateCompatibility(adoption, pet);
  res.json({
    score: compatibility.score,
    factors: compatibility.factors,
    source,
    adoptionId: adoption.id,
  });
}

export async function updateAdoptionStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const parsed = adoptionStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const values: AdoptionStatusUpdateInput = parsed.data;
  const statusCode = values.status.trim().toUpperCase() as AdoptionStatusCode;
  const statusId = adoptionStatusByCode.get(statusCode);
  if (!statusId) return res.status(400).json({ error: "Estado invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  // Validación de transición incremental (espejo de la regla del front): solo se
  // admite avanzar al estado siguiente de la cadena o pasar a DESCARTADA.
  const previousStatusCode = getAdoptionStatusCode(adoption.statusId);
  if (previousStatusCode && statusCode !== previousStatusCode) {
    const allowed = allowedNextAdoptionStatuses(previousStatusCode);
    if (!allowed.includes(statusCode)) {
      return res.status(409).json({
        error: isTerminalAdoptionStatus(previousStatusCode)
          ? "La solicitud está finalizada y no admite cambios de estado."
          : `Transición no permitida: desde ${previousStatusCode} solo se puede pasar a ${allowed.join(" o ")}.`,
      });
    }
  }

  // Gating por checklist: ciertas transiciones exigen ítems verificados.
  const requeridos = requiredChecksFor(statusId);
  if (requeridos.length > 0 && statusId !== adoption.statusId) {
    const hechos = await checkRepo().findBy({ adoptionId: id });
    const hechosSet = new Set(hechos.map((c) => c.item));
    const faltan = requeridos.filter((r) => !hechosSet.has(r));
    if (faltan.length > 0) {
      return res.status(409).json({
        error: `Faltan completar ítems de la evaluación: ${faltan.join(", ")}.`,
      });
    }
  }

  const previousStatusId = adoption.statusId;
  const A = CatalogIds.adoptionStatus;
  const R = CatalogIds.petReportStatus;

  // La publicación se "reserva" al programar la entrevista: por eso solo se puede
  // programar si la mascota está disponible (en adopción y publicada/activa).
  const pet = adoption.petId
    ? await petRepo().findOneBy({ id: adoption.petId })
    : null;
  const esTransito = adoption.kind === "transito";
  if (
    statusId === A.entrevistaPendiente &&
    previousStatusId !== statusId &&
    pet
  ) {
    // Adopción: la mascota debe estar "en adopción". Tránsito: "en tránsito".
    const disponible = esTransito
      ? pet.statusId === CatalogIds.petStatus.transito
      : pet.statusId === CatalogIds.petStatus.adopcion;
    const publicada = pet.reportStatusId === R.activo;
    if (!disponible || !publicada) {
      return res.status(409).json({
        error: esTransito
          ? "No se puede programar la entrevista: la mascota debe estar en tránsito y publicada."
          : "No se puede programar la entrevista: la mascota debe estar en adopción y publicada.",
      });
    }
  }

  if (adoption.refugioId == null) {
    adoption.refugioId = req.authUser?.refugioId ?? null;
  }
  adoption.statusId = statusId;
  const saved = await adoptionRepo().save(adoption);

  // La solicitud manda y la publicación reacciona (la publicación nunca toca la solicitud).
  if (pet && previousStatusId !== statusId) {
    let petChanged = false;
    if (statusId === A.entrevistaPendiente) {
      // Se programó la entrevista → la publicación queda reservada (oculta del público).
      pet.reportStatusId = R.reservada;
      petChanged = true;
    } else if (statusId === A.descartada) {
      // Si esta solicitud era la que tenía reservada la mascota, se vuelve a publicar.
      const eraReservadora =
        previousStatusId === A.entrevistaPendiente ||
        previousStatusId === A.aceptadaConSeguimiento;
      if (eraReservadora && pet.reportStatusId === R.reservada) {
        pet.reportStatusId = R.activo;
        petChanged = true;
      }
    } else if (statusId === A.aceptada) {
      // Concretada: tránsito → la mascota queda "en tránsito"; adopción → "adoptado".
      // En ambos casos la publicación se cierra (finalizado).
      pet.statusId = esTransito
        ? CatalogIds.petStatus.transito
        : CatalogIds.petStatus.adoptado;
      pet.reportStatusId = R.finalizado;
      petChanged = true;
    }
    if (petChanged) {
      stampRefugioIfManaged(pet, req.authUser);
      await petRepo().save(pet);
    }
  }

  if (statusId === A.aceptadaConSeguimiento && previousStatusId !== statusId) {
    await createFollowupsForAdoption(saved, req.authUser?.id ?? null);
  }

  // Si el admin DESCARTA una solicitud que ya estaba "Aceptada con seguimiento"
  // (decide que la mascota no es para ese adoptante), los seguimientos post-adopción
  // que se habían agendado ya no corresponden: se cancelan (borran los pendientes).
  // La mascota ya volvió a publicarse arriba (reportStatus → activo), es decir,
  // vuelve a estar disponible en adopción.
  if (
    statusId === A.descartada &&
    previousStatusId === A.aceptadaConSeguimiento &&
    adoption.petId &&
    typeof adoption.userId === "number"
  ) {
    await followupRepo().delete({
      petId: adoption.petId,
      adopterUserId: adoption.userId,
      typeId: CatalogIds.followupType.postAdopcion,
      statusId: CatalogIds.followupStatus.pendiente,
    });
  }

  // Al descartar, si el admin dejó un motivo, lo guardamos como nota "Rechazo:"
  // para mostrárselo al solicitante en "Mis Solicitudes".
  const reason = typeof values.reason === "string" ? values.reason.trim() : "";
  if (statusId === A.descartada && reason) {
    const authorId = req.authUser?.id ?? null;
    let authorName: string | null = null;
    if (authorId) {
      const author = await userRepo().findOneBy({ id: authorId });
      authorName = author?.name ?? author?.email ?? null;
    }
    await adoptionNoteRepo().save(
      adoptionNoteRepo().create({
        adoptionId: id,
        text: `Rechazo: ${reason}`,
        authorId,
        authorName,
      }),
    );
  }

  // Notificar al solicitante el cambio de estado de su solicitud.
  if (previousStatusId !== statusId) {
    await notify(saved.userId, {
      type: "adoption_status",
      title: "Tu solicitud de adopción cambió de estado",
      body:
        statusId === A.descartada && reason
          ? `Descartada. Motivo: ${reason.slice(0, 100)}`
          : `Ahora está: ${ADOPTION_STATUS_LABELS[statusCode] ?? statusCode}`,
      link: "/account",
    });
  }

  res.json(await serializeAdoptionDetail(saved));
}

/**
 * Cancelar (retirar) una solicitud propia. Accesible para el usuario dueño de la
 * solicitud (no admin): la pasa a DESCARTADA. Si la solicitud tenía la
 * publicación reservada, la mascota vuelve a estar publicada/activa.
 */
export async function cancelMyAdoption(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const userId = req.authUser?.id;
  if (!Number.isInteger(userId))
    return res.status(401).json({ error: "Usuario no autenticado" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });
  if (adoption.userId !== userId)
    return res.status(403).json({ error: "No autorizado" });

  const code = getAdoptionStatusCode(adoption.statusId);
  if (code === "ACEPTADA" || code === "DESCARTADA") {
    return res
      .status(409)
      .json({
        error: "La solicitud ya está finalizada y no se puede cancelar.",
      });
  }

  const A = CatalogIds.adoptionStatus;
  const R = CatalogIds.petReportStatus;
  const previousStatusId = adoption.statusId;
  adoption.statusId = A.descartada;
  const saved = await adoptionRepo().save(adoption);

  // Si esta solicitud tenía la publicación reservada, se vuelve a publicar.
  if (adoption.petId) {
    const pet = await petRepo().findOneBy({ id: adoption.petId });
    if (pet) {
      const eraReservadora =
        previousStatusId === A.entrevistaPendiente ||
        previousStatusId === A.aceptadaConSeguimiento;
      if (eraReservadora && pet.reportStatusId === R.reservada) {
        pet.reportStatusId = R.activo;
        await petRepo().save(pet);
      }
    }
  }

  const catalogValuesById = await getCatalogValuesById();
  res.json(serializeAdoption(saved, catalogValuesById));
}

export async function deleteAdoption(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const result = await adoptionRepo().delete({ id });
  if (result.affected === 0)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  res.status(204).send();
}

// ── Evaluación del adoptante (checklist + impresiones) ──────────────────────

/** Devuelve el checklist (definición + ítems marcados) y las impresiones. */
export async function getAdoptionEvaluation(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  const [checks, notes] = await Promise.all([
    checkRepo().findBy({ adoptionId: id }),
    adoptionNoteRepo().find({
      where: { adoptionId: id },
      order: { createdAt: "DESC" },
    }),
  ]);

  res.json({
    items: EVAL_CHECKLIST,
    checked: checks.map((c) => c.item),
    notes: notes.map((n) => ({
      id: n.id,
      text: n.text,
      author: n.authorName,
      createdAt: n.createdAt,
    })),
  });
}

/** Marca o desmarca un ítem del checklist. Body: { item, done }. */
export async function toggleAdoptionCheck(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const item = typeof req.body?.item === "string" ? req.body.item.trim() : "";
  const done = req.body?.done !== false; // por defecto marca
  if (!EVAL_CHECKLIST.includes(item)) {
    return res.status(400).json({ error: "Ítem de checklist inválido" });
  }

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  const existing = await checkRepo().findOneBy({ adoptionId: id, item });
  if (done && !existing) {
    await checkRepo().save(
      checkRepo().create({
        adoptionId: id,
        item,
        checkedBy: req.authUser?.id ?? null,
      }),
    );
  } else if (!done && existing) {
    await checkRepo().remove(existing);
  }

  const checks = await checkRepo().findBy({ adoptionId: id });
  res.json({ checked: checks.map((c) => c.item) });
}

/** Agrega una impresión / nota libre a la evaluación. Body: { text }. */
export async function addAdoptionNote(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "Id invalido" });

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text)
    return res.status(400).json({ error: "La nota no puede estar vacía" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption)
    return res.status(404).json({ error: "Solicitud no encontrada" });

  const authorId = req.authUser?.id ?? null;
  let authorName: string | null = null;
  if (authorId) {
    const author = await userRepo().findOneBy({ id: authorId });
    authorName = author?.name ?? author?.email ?? null;
  }

  const note = await adoptionNoteRepo().save(
    adoptionNoteRepo().create({ adoptionId: id, text, authorId, authorName }),
  );
  res.status(201).json({
    id: note.id,
    text: note.text,
    author: note.authorName,
    createdAt: note.createdAt,
  });
}
