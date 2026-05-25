import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { CatalogValue } from "../entity/CatalogValue.js";
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

type CatalogValueMap = Map<number, CatalogValue>;

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
