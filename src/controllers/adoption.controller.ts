import { Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { Catalog, CatalogName } from "../lib/catalog-constants.js";

function adoptionRepo() {
  return AppDataSource.getRepository(Adoption);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

type CatalogValueMap = Map<number, CatalogValue>;

const adoptionStatuses = [
  "NUEVA",
  "EN_EVALUACION",
  "ENTREVISTA_PENDIENTE",
  "ACEPTADA_CON_SEGUIMIENTO",
  "ACEPTADA",
  "DESCARTADA",
] as const;

function catalogInfo(catalogValuesById: CatalogValueMap, id: number | null | undefined) {
  const item = id ? catalogValuesById.get(id) ?? null : null;
  return item ? { id: item.id, code: item.code, label: item.label } : null;
}

function serializeAdoption(adoption: Adoption, catalogValuesById: CatalogValueMap) {
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
    status: adoption.status ?? "NUEVA",
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

function parseStatus(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return adoptionStatuses.includes(trimmed as (typeof adoptionStatuses)[number])
    ? trimmed
    : undefined;
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function buildAdoptionFilters(req: Request) {
  const userId = parseOptionalInt(req.query.userId);
  const petId = typeof req.query.petId === "string" ? req.query.petId.trim() : "";
  const status = parseStatus(req.query.status);
  const compatibilityMin = parseOptionalNumber(req.query.compatibilityMin);
  const compatibilityMax = parseOptionalNumber(req.query.compatibilityMax);

  return {
    userId,
    petId: petId.length > 0 ? petId : undefined,
    status,
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
      status: item.status ?? "NUEVA",
      compatibilityScore: item.compatibilityScore ?? null,
      createdAt: item.createdAt,
      applicantName: `${item.firstName} ${item.lastName}`.trim(),
      applicantEmail: item.email,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      userPhoto: user?.photo ?? null,
      petName: pet?.name ?? null,
      petPhoto: pet?.photo ?? null,
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
    status: "NUEVA",
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

  const qb = adoptionRepo().createQueryBuilder("adoption");
  if (filters.userId) qb.andWhere("adoption.userId = :userId", { userId: filters.userId });
  if (filters.petId) qb.andWhere("adoption.petId = :petId", { petId: filters.petId });
  if (filters.status) qb.andWhere("adoption.status = :status", { status: filters.status });
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

  const [items, total] = await qb
    .orderBy("adoption.createdAt", "DESC")
    .skip(skip)
    .take(pageSize)
    .getManyAndCount();

  const summaryQb = adoptionRepo().createQueryBuilder("adoption");
  if (filters.userId) summaryQb.andWhere("adoption.userId = :userId", { userId: filters.userId });
  if (filters.petId) summaryQb.andWhere("adoption.petId = :petId", { petId: filters.petId });
  if (filters.compatibilityMin !== undefined) {
    summaryQb.andWhere("adoption.compatibilityScore >= :compatibilityMin", {
      compatibilityMin: filters.compatibilityMin,
    });
  }
  if (filters.compatibilityMax !== undefined) {
    summaryQb.andWhere("adoption.compatibilityScore <= :compatibilityMax", {
      compatibilityMax: filters.compatibilityMax,
    });
  }

  const rawSummary = await summaryQb
    .select("adoption.status", "status")
    .addSelect("COUNT(*)", "count")
    .groupBy("adoption.status")
    .getRawMany<{ status: string; count: string }>();

  const statusTotals = adoptionStatuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});
  for (const row of rawSummary) {
    statusTotals[row.status] = Number(row.count) || 0;
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

  const catalogValuesById = await getCatalogValuesById();
  const user = adoption.userId ? await userRepo().findOneBy({ id: adoption.userId }) : null;
  const pet = adoption.petId ? await petRepo().findOneBy({ id: adoption.petId }) : null;

  res.json({
    ...serializeAdoption(adoption, catalogValuesById),
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
          photo: pet.photo,
          animalTypeId: pet.animalTypeId,
          statusId: pet.statusId,
          reportStatusId: pet.reportStatusId,
        }
      : null,
    messages: [],
    history: [],
  });
}
