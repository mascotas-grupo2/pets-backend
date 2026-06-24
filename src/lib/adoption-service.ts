import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { Catalog } from "./catalog-constants.js";
import {
  CatalogValidationError,
  resolveCatalogValueId,
} from "./catalog-values.js";

/**
 * Input simplificado de una solicitud de adopción desde el chatbot.
 *
 * La entidad Adoption tiene ~20 campos opcionales (situación habitacional,
 * mascotas previas, alergias, etc.). El chatbot recolecta solo los datos
 * MÍNIMOS para crear la solicitud; el resto del formulario se completa
 * desde la app web.
 */
export type SimpleAdoptionInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  postcode: string;
  town: string;
  /** Tipo de animal preferido (code: perro/gato/otro). Opcional. */
  preferredAnimalType?: string;
  /** UUID de una mascota específica que el usuario quiere adoptar. Opcional. */
  petId?: string;
  /** Experiencia previa con mascotas (texto libre). Opcional. */
  experience?: string;
};

export type CreateAdoptionOptions = {
  userId: number;
};

function adoptionRepo() {
  return AppDataSource.getRepository(Adoption);
}

/**
 * Crea una solicitud de adopción asociada al usuario autenticado.
 *
 * Lanza `CatalogValidationError` si el preferredAnimalType no resuelve.
 */
export async function createAdoptionRequest(
  input: SimpleAdoptionInput,
  options: CreateAdoptionOptions,
) {
  const preferredAnimalTypeId = input.preferredAnimalType
    ? await resolveCatalogValueId(
        Catalog.ANIMAL_TYPE,
        { code: input.preferredAnimalType },
        false,
      )
    : null;

  const adoption = adoptionRepo().create({
    userId: options.userId,
    petId: input.petId ?? null,
    preferredAnimalTypeId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    addressLine1: input.addressLine1,
    addressLine2: null,
    postcode: input.postcode,
    town: input.town,
    // Campos opcionales del formulario completo — quedan en null para que el
    // usuario los complete después desde la app web si lo desea.
    hasGardenId: null,
    livingSituationId: null,
    householdSettingId: null,
    activityLevelId: null,
    adults: null,
    children: null,
    visitingChildrenId: null,
    hasFlatmatesId: null,
    allergies: null,
    otherAnimalsId: null,
    otherAnimalsDetail: null,
    neuteredId: null,
    vaccinatedId: null,
    experience: input.experience ?? null,
    // El usuario aceptó términos al confirmarle al bot que quiere enviar
    // la solicitud (el system prompt obliga a pedir confirmación explícita).
    acceptsTerms: true,
  });

  return adoptionRepo().save(adoption);
}
