import { Adoption } from "../entity/Adoption.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";

export type CatalogValueMap = Map<number, CatalogValue>;

export interface CatalogInfo {
  id: number;
  code: string;
  label: string;
}

export function catalogInfo(
  catalogValuesById: CatalogValueMap,
  id: number | null | undefined,
): CatalogInfo | null {
  const item = id ? catalogValuesById.get(id) ?? null : null;
  return item ? { id: item.id, code: item.code, label: item.label } : null;
}

export function serializeMascota(mascota: Pet, catalogValuesById: CatalogValueMap) {
  const animalType = catalogInfo(catalogValuesById, mascota.animalTypeId);
  const sex = catalogInfo(catalogValuesById, mascota.sexId);
  const status = catalogInfo(catalogValuesById, mascota.statusId);
  const reportStatus = catalogInfo(catalogValuesById, mascota.reportStatusId);
  const medicalStatus = catalogInfo(catalogValuesById, mascota.medicalStatusId);
  const activityLevel = catalogInfo(catalogValuesById, (mascota as any).activityLevelId);
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
    activityLevel: activityLevel?.code ?? null,
    activityLevelLabel: activityLevel?.label ?? null,
    activityLevelInfo: activityLevel,
  };
}

export function serializePetNote(note: PetNote, catalogValuesById: CatalogValueMap) {
  const kind = catalogInfo(catalogValuesById, note.kindId);
  return {
    ...note,
    kind: kind?.code ?? null,
    kindLabel: kind?.label ?? null,
    kindInfo: kind,
  };
}

export function serializeAdoption(adoption: Adoption, catalogValuesById: CatalogValueMap) {
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
