import { z } from "zod";

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const catalogReference = z.preprocess(
  (value) => {
    if (value === "" || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  },
  z
    .union([
      z.string().trim().min(1).max(80),
      z.number().int().positive(),
    ])
    .optional(),
);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid().optional(),
);

export const adoptionSchema = z.object({
  userId: z.number().int().positive().optional(),
  petId: optionalUuid,
  preferredAnimalTypeId: optionalPositiveInt,
  preferredAnimal: catalogReference,
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().min(1).max(30),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().default(""),
  postcode: z.string().min(1).max(20),
  town: z.string().min(1).max(120),
  hasGardenId: optionalPositiveInt,
  hasGarden: catalogReference,
  livingSituationId: optionalPositiveInt,
  livingSituation: catalogReference,
  householdSettingId: optionalPositiveInt,
  householdSetting: catalogReference,
  activityLevelId: optionalPositiveInt,
  activityLevel: catalogReference,
  adults: z.number().int().nonnegative(),
  children: z.number().int().nonnegative(),
  visitingChildrenId: optionalPositiveInt,
  visitingChildren: catalogReference,
  hasFlatmatesId: optionalPositiveInt,
  hasFlatmates: catalogReference,
  allergies: z.string().max(2000).optional().default(""),
  otherAnimalsId: optionalPositiveInt,
  otherAnimals: catalogReference,
  otherAnimalsDetail: z.string().max(2000).optional().default(""),
  neuteredId: optionalPositiveInt,
  neutered: catalogReference,
  vaccinatedId: optionalPositiveInt,
  vaccinated: catalogReference,
  experience: z.string().max(2000).optional().default(""),
  acceptsTerms: z.boolean(),
  // "adopcion" (default) | "transito": ofrecimiento de hogar de tránsito.
  kind: z.enum(["adopcion", "transito"]).optional().default("adopcion"),
});

export type AdoptionInput = z.infer<typeof adoptionSchema>;

export const adoptionStatusUpdateSchema = z.object({
  status: z.string().trim().min(1).max(120),
  // Motivo opcional (se usa al DESCARTAR para comunicárselo al solicitante).
  reason: z.string().max(2000).optional(),
});

export type AdoptionStatusUpdateInput = z.infer<typeof adoptionStatusUpdateSchema>;
