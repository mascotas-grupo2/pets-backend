import { AppDataSource } from "../data-source.js";
import { dbManager } from "./db-context.js";
import { Pet } from "../entity/Pet.js";
import { Catalog } from "./catalog-constants.js";
import {
  CatalogValidationError,
  resolveCatalogValueId,
} from "./catalog-values.js";
import { geocodificarDireccion } from "./geocoding.js";

/**
 * Input "simplificado" del Pet para uso desde el chatbot (sin fotos, sin
 * multipart). Las fotos quedan en el controller HTTP que maneja multer.
 *
 * Acepta `code` para los catálogos (animalType, sex, status, medicalStatus)
 * para que el LLM pueda usar valores legibles ("perro", "perdido") en vez
 * de IDs internos.
 */
export type SimplePetInput = {
  name?: string | null;
  description: string;
  animalType: string; // code (perro/gato/otro) — requerido
  date: string;
  location: string;
  contactPhone: string;
  contactEmail: string;
  sex?: string;
  breed?: string;
  ageMonths?: number;
  color?: string;
  weightKg?: number;
  heightCm?: number;
  hasCollar?: boolean;
  hasTag?: boolean;
  microchipped?: boolean;
  neutered?: boolean;
  vaccinated?: boolean;
  friendlyWithKids?: boolean;
  trained?: boolean;
  reward?: string;
  status?: string;        // default "perdido" si no se pasa
  medicalStatus?: string;
};

export type CreatePetOptions = {
  /** Si se provee, queda asociado al usuario en `pet.userId`. */
  userId?: number;
  /** Si no se pasa status en el input, se usa este. Default "perdido". */
  defaultStatus?: string;
};

function petRepo() {
  return dbManager().getRepository(Pet);
}

/**
 * Crea un Pet validando catálogos y geocodificando la ubicación.
 * Reutilizable desde controllers HTTP y desde tools del chatbot.
 *
 * Lanza `CatalogValidationError` si algún catálogo no resuelve.
 */
export async function createPet(
  input: SimplePetInput,
  options: CreatePetOptions = {},
) {
  // 1. Resolver catálogos. animalType es obligatorio.
  const animalTypeId = await resolveCatalogValueId(
    Catalog.ANIMAL_TYPE,
    { code: input.animalType },
    true,
  );
  if (!animalTypeId) {
    throw new CatalogValidationError("animalType es requerido");
  }

  const sexId = input.sex
    ? await resolveCatalogValueId(Catalog.PET_SEX, { code: input.sex }, false)
    : null;

  const statusCode = input.status ?? options.defaultStatus ?? "perdido";
  const statusId = await resolveCatalogValueId(
    Catalog.PET_STATUS,
    { code: statusCode },
    false,
  );

  const medicalStatusId = input.medicalStatus
    ? await resolveCatalogValueId(
        Catalog.PET_MEDICAL_STATUS,
        { code: input.medicalStatus },
        false,
      )
    : null;

  // 2. Geocodificar la ubicación (best-effort, no falla si no resuelve).
  const coords = await geocodificarDireccion(input.location).catch(() => null);

  // 3. Armar el registro. Solo seteamos campos que el usuario haya provisto.
  const pet = petRepo().create({
    name: input.name ?? null,
    description: input.description,
    animalTypeId,
    date: input.date,
    location: input.location,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail,
    breed: input.breed ?? null,
    ageMonths: input.ageMonths ?? null,
    color: input.color ?? null,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    hasCollar: input.hasCollar ?? null,
    hasTag: input.hasTag ?? null,
    microchipped: input.microchipped ?? null,
    neutered: input.neutered ?? null,
    vaccinated: input.vaccinated ?? null,
    friendlyWithKids: input.friendlyWithKids ?? null,
    trained: input.trained ?? null,
    reward: input.reward ?? null,
    userId: options.userId ?? null,
    latitud: coords?.latitud ?? null,
    longitud: coords?.longitud ?? null,
    ...(sexId !== null && sexId !== undefined ? { sexId } : {}),
    ...(statusId !== null && statusId !== undefined ? { statusId } : {}),
    ...(medicalStatusId !== null && medicalStatusId !== undefined
      ? { medicalStatusId }
      : {}),
  });

  return petRepo().save(pet);
}
