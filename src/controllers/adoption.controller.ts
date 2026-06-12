import { Request, Response } from "express";
import { In, SelectQueryBuilder } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Followup } from "../entity/Followup.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { AdoptionCheck } from "../entity/AdoptionCheck.js";
import { AdoptionNote } from "../entity/AdoptionNote.js";
import { adoptionSchema, AdoptionInput, adoptionStatusUpdateSchema, AdoptionStatusUpdateInput } from "../schemas/adoption.schema.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { Catalog, CatalogIds, CatalogName } from "../lib/catalog-constants.js";
import { calculateCompatibility } from "../lib/matching.js";
import { notify } from "../lib/notify.js";

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
  return AppDataSource.getRepository(Adoption);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

function followupRepo() {
  return AppDataSource.getRepository(Followup);
}

function checkRepo() {
  return AppDataSource.getRepository(AdoptionCheck);
}

function adoptionNoteRepo() {
  return AppDataSource.getRepository(AdoptionNote);
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

function createFollowupsForAdoption(adoption: Adoption) {
  const petId = adoption.petId;
  const userId = adoption.userId;
  if (!petId || typeof userId !== "number" || !Number.isInteger(userId)) return;

  const baseDate = new Date();
  const offsets = [7, 30, 90];
  const followups = offsets.map((days) => {
    const appointmentAt = new Date(baseDate);
    appointmentAt.setDate(appointmentAt.getDate() + days);

    const followup = new Followup();
    followup.petId = petId;
    followup.userId = userId;
    followup.typeId = CatalogIds.followupType.programado;
    followup.statusId = CatalogIds.followupStatus.pendiente;
    followup.appointmentAt = appointmentAt;
    return followup;
  });

  return followupRepo().save(followups);
}

type CatalogValueMap = Map<number, CatalogValue>;

const adoptionStatusEntries = [
  { code: "NUEVA", id: CatalogIds.adoptionStatus.nueva },
  { code: "EN_EVALUACION", id: CatalogIds.adoptionStatus.enEvaluacion },
  { code: "ENTREVISTA_PENDIENTE", id: CatalogIds.adoptionStatus.entrevistaPendiente },
  { code: "ACEPTADA_CON_SEGUIMIENTO", id: CatalogIds.adoptionStatus.aceptadaConSeguimiento },
  { code: "ACEPTADA", id: CatalogIds.adoptionStatus.aceptada },
  { code: "DESCARTADA", id: CatalogIds.adoptionStatus.descartada },
] as const;

type AdoptionStatusId = (typeof adoptionStatusEntries)[number]["id"];
type AdoptionStatusCode = (typeof adoptionStatusEntries)[number]["code"];

const adoptionStatusById: Map<AdoptionStatusId, AdoptionStatusCode> = new Map(
  adoptionStatusEntries.map((entry) => [entry.id, entry.code]),
);
const adoptionStatusByCode: Map<AdoptionStatusCode, AdoptionStatusId> = new Map(
  adoptionStatusEntries.map((entry) => [entry.code, entry.id]),
);

function isAdoptionStatusId(value: number): value is AdoptionStatusId {
  return adoptionStatusById.has(value as AdoptionStatusId);
}

function getAdoptionStatusCode(id: number | null | undefined) {
  if (typeof id !== "number" || !Number.isInteger(id)) return undefined;
  return isAdoptionStatusId(id) ? adoptionStatusById.get(id) : undefined;
}

// Cadena incremental de estados. Debe coincidir con la regla del front
// (components/admin/lib/solicitud-status.tsx): solo se puede avanzar al estado
// inmediatamente siguiente o pasar a DESCARTADA; ACEPTADA y DESCARTADA son terminales.
const adoptionStatusChain: AdoptionStatusCode[] = [
  "NUEVA",
  "EN_EVALUACION",
  "ENTREVISTA_PENDIENTE",
  "ACEPTADA_CON_SEGUIMIENTO",
  "ACEPTADA",
];

function isTerminalAdoptionStatus(code: AdoptionStatusCode) {
  return code === "ACEPTADA" || code === "DESCARTADA";
}

function allowedNextAdoptionStatuses(code: AdoptionStatusCode): AdoptionStatusCode[] {
  if (isTerminalAdoptionStatus(code)) return [];
  const idx = adoptionStatusChain.indexOf(code);
  const next =
    idx >= 0 && idx < adoptionStatusChain.length - 1 ? adoptionStatusChain[idx + 1] : null;
  const result: AdoptionStatusCode[] = [];
  if (next) result.push(next);
  result.push("DESCARTADA");
  return result;
}

function catalogInfo(catalogValuesById: CatalogValueMap, id: number | null | undefined) {
  const item = id ? catalogValuesById.get(id) ?? null : null;
  return item ? { id: item.id, code: item.code, label: item.label } : null;
}

function serializeAdoption(adoption: Adoption, catalogValuesById: CatalogValueMap) {
  const status = catalogInfo(catalogValuesById, adoption.statusId);
  const preferredAnimalType = catalogInfo(catalogValuesById, adoption.preferredAnimalTypeId);
  const hasGarden = catalogInfo(catalogValuesById, adoption.hasGardenId);
  const livingSituation = catalogInfo(catalogValuesById, adoption.livingSituationId);
  const householdSetting = catalogInfo(catalogValuesById, adoption.householdSettingId);
  const activityLevel = catalogInfo(catalogValuesById, adoption.activityLevelId);
  const visitingChildren = catalogInfo(catalogValuesById, adoption.visitingChildrenId);
  const hasFlatmates = catalogInfo(catalogValuesById, adoption.hasFlatmatesId);
  const otherAnimals = catalogInfo(catalogValuesById, adoption.otherAnimalsId);
  const neutered = catalogInfo(catalogValuesById, adoption.neuteredId);
  const vaccinated = catalogInfo(catalogValuesById, adoption.vaccinatedId);

  return {
    ...adoption,
    statusId: adoption.statusId,
    status: status?.code ?? "NUEVA",
    statusLabel: status?.label ?? "Nueva",
    compatibilityScore: adoption.compatibilityScore ?? null,
    preferredAnimal: preferredAnimalType?.code ?? null,
    preferredAnimalLabel: preferredAnimalType?.label ?? null,
    preferredAnimalType,
    hasGarden: hasGarden?.code ?? null,
    hasGardenLabel: hasGarden?.label ?? null,
    livingSituation: livingSituation?.code ?? null,
    livingSituationLabel: livingSituation?.label ?? null,
    householdSetting: householdSetting?.code ?? null,
    householdSettingLabel: householdSetting?.label ?? null,
    activityLevel: activityLevel?.code ?? null,
    activityLevelLabel: activityLevel?.label ?? null,
    visitingChildren: visitingChildren?.code ?? null,
    visitingChildrenLabel: visitingChildren?.label ?? null,
    hasFlatmates: hasFlatmates?.code ?? null,
    hasFlatmatesLabel: hasFlatmates?.label ?? null,
    otherAnimals: otherAnimals?.code ?? null,
    otherAnimalsLabel: otherAnimals?.label ?? null,
    neutered: neutered?.code ?? null,
    neuteredLabel: neutered?.label ?? null,
    vaccinated: vaccinated?.code ?? null,
    vaccinatedLabel: vaccinated?.label ?? null,
  };
}

async function serializeAdoptionDetail(adoption: Adoption) {
  const catalogValuesById = await getCatalogValuesById();
  const adopted = serializeAdoption(adoption, catalogValuesById);
  const user = adoption.userId ? await userRepo().findOneBy({ id: adoption.userId }) : null;
  const pet = adoption.petId ? await petRepo().findOneBy({ id: adoption.petId }) : null;

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

function parseOptionalInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

function parseOptionalNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric;
}

function parseStatusId(value: unknown, statusIdValue: unknown) {
  const numericStatusId = parseOptionalInt(statusIdValue);
  if (numericStatusId && isAdoptionStatusId(numericStatusId)) return numericStatusId;

  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return adoptionStatusByCode.get(trimmed as AdoptionStatusCode) ?? undefined;
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

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

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
  const petId = typeof req.query.petId === "string" ? req.query.petId.trim() : "";
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

  const userIds = [...new Set(items.map((i) => i.userId).filter((id): id is number => Number.isInteger(id)))];
  const petIds = [...new Set(items.map((i) => i.petId).filter((id): id is string => typeof id === "string"))];

  const users = userIds.length ? await userRepo().findBy({ id: In(userIds) }) : [];
  const pets = petIds.length ? await petRepo().findBy({ id: In(petIds) }) : [];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const petsById = new Map(pets.map((p) => [p.id, p]));

  return items.map((item) => {
    const user = item.userId != null ? usersById.get(item.userId) : undefined;
    const pet = item.petId ? petsById.get(item.petId) : undefined;
    return {
      id: item.id,
      userId: item.userId,
      petId: item.petId,
      statusId: item.statusId,
      status: getAdoptionStatusCode(item.statusId) ?? "NUEVA",
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

async function resolveAdoptionCatalogIds(values: AdoptionInput) {
  return {
    preferredAnimalTypeId: await resolveCatalogId(
      Catalog.ANIMAL_TYPE,
      values.preferredAnimalTypeId,
      values.preferredAnimal,
      false,
    ),
    hasGardenId: await resolveCatalogId(Catalog.YES_NO, values.hasGardenId, values.hasGarden, true),
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
    otherAnimalsId: await resolveCatalogId(Catalog.YES_NO, values.otherAnimalsId, values.otherAnimals, true),
    neuteredId: await resolveCatalogId(Catalog.YES_NO_NA, values.neuteredId, values.neutered, true),
    vaccinatedId: await resolveCatalogId(Catalog.YES_NO_NA, values.vaccinatedId, values.vaccinated, true),
  };
}

export async function createAdoption(req: Request, res: Response) {
  const parsed = adoptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

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
  });

  if (adoption.petId) {
    const pet = await petRepo().findOneBy({ id: adoption.petId });
    if (pet) {
      adoption.compatibilityScore = calculateCompatibility(adoption, pet).score;
    }
  }

  const saved = await adoptionRepo().save(adoption);
  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json(serializeAdoption(saved, catalogValuesById));
}

export async function listAdoptions(req: Request, res: Response) {
  const repo = adoptionRepo();
  const isAdmin = req.authUser?.role === "admin";
  if (isAdmin) {
    const all = await repo.find({ order: { createdAt: "DESC" } });
    const catalogValuesById = await getCatalogValuesById();
    return res.json(all.map((item) => serializeAdoption(item, catalogValuesById)));
  }

  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "Usuario no autenticado" });
  const items = await repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  const catalogValuesById = await getCatalogValuesById();
  res.json(items.map((item) => serializeAdoption(item, catalogValuesById)));
}

export async function adminListAdoptionsPaged(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  const filters = buildAdoptionFilters(req);
  const sortOrders = parseSort(req);

  const qb = adoptionRepo().createQueryBuilder("adoption");
  if (filters.userId) qb.andWhere("adoption.userId = :userId", { userId: filters.userId });
  if (filters.petId) qb.andWhere("adoption.petId = :petId", { petId: filters.petId });
  if (filters.statusId) qb.andWhere("adoption.statusId = :statusId", { statusId: filters.statusId });
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

  const ordered = applySort(qb, sortOrders);
  const [items, total] = await ordered.skip(skip).take(pageSize).getManyAndCount();

  // Los cards deben mostrar los totales por estado del conjunto completo,
  // mientras que la lista paginada aplica los filtros del query.
  const rawSummary = await adoptionRepo()
    .createQueryBuilder("adoption")
    .select("adoption.statusId", "statusId")
    .addSelect("COUNT(*)", "count")
    .groupBy("adoption.statusId")
    .getRawMany<{ statusId: string; count: string }>();

  const statusTotals = adoptionStatusEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.code] = 0;
    return acc;
  }, {});
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
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption) return res.status(404).json({ error: "Solicitud no encontrada" });

  const isAdmin = req.authUser?.role === "admin";
  if (!isAdmin) {
    const userId = req.authUser?.id;
    if (!Number.isInteger(userId) || adoption.userId !== userId) {
      return res.status(403).json({ error: "No autorizado" });
    }
  }

  res.json(await serializeAdoptionDetail(adoption));
}

export async function updateAdoptionStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const parsed = adoptionStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const values: AdoptionStatusUpdateInput = parsed.data;
  const statusCode = values.status.trim().toUpperCase() as AdoptionStatusCode;
  const statusId = adoptionStatusByCode.get(statusCode);
  if (!statusId) return res.status(400).json({ error: "Estado invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption) return res.status(404).json({ error: "Solicitud no encontrada" });

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
  if (
    statusId === A.entrevistaPendiente &&
    previousStatusId !== statusId &&
    pet
  ) {
    const enAdopcion = pet.statusId === CatalogIds.petStatus.adopcion;
    const publicada = pet.reportStatusId === R.activo;
    if (!enAdopcion || !publicada) {
      return res.status(409).json({
        error:
          "No se puede programar la entrevista: la mascota debe estar en adopción y publicada.",
      });
    }
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
      // Adopción concretada → mascota adoptada y publicación cerrada.
      pet.statusId = CatalogIds.petStatus.adoptado;
      pet.reportStatusId = R.finalizado;
      petChanged = true;
    }
    if (petChanged) await petRepo().save(pet);
  }

  if (statusId === A.aceptadaConSeguimiento && previousStatusId !== statusId) {
    await createFollowupsForAdoption(saved);
  }

  // Notificar al solicitante el cambio de estado de su solicitud.
  if (previousStatusId !== statusId) {
    await notify(saved.userId, {
      type: "adoption_status",
      title: "Tu solicitud de adopción cambió de estado",
      body: `Ahora está: ${ADOPTION_STATUS_LABELS[statusCode] ?? statusCode}`,
      link: "/account",
    });
  }

  res.json(await serializeAdoptionDetail(saved));
}

export async function deleteAdoption(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const result = await adoptionRepo().delete({ id });
  if (result.affected === 0) return res.status(404).json({ error: "Solicitud no encontrada" });

  res.status(204).send();
}

// ── Evaluación del adoptante (checklist + impresiones) ──────────────────────

/** Devuelve el checklist (definición + ítems marcados) y las impresiones. */
export async function getAdoptionEvaluation(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption) return res.status(404).json({ error: "Solicitud no encontrada" });

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
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const item = typeof req.body?.item === "string" ? req.body.item.trim() : "";
  const done = req.body?.done !== false; // por defecto marca
  if (!EVAL_CHECKLIST.includes(item)) {
    return res.status(400).json({ error: "Ítem de checklist inválido" });
  }

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption) return res.status(404).json({ error: "Solicitud no encontrada" });

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
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "La nota no puede estar vacía" });

  const adoption = await adoptionRepo().findOneBy({ id });
  if (!adoption) return res.status(404).json({ error: "Solicitud no encontrada" });

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
