import { z } from "zod";

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);


const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (value === "" || value === null) return undefined;
    return value;
  },
  z.string().min(1).max(120).optional(),
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

const petBaseSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  userId: z.number().int().positive().optional(),
  name: optionalNonEmptyString,
  photo: z.string().min(1).nullable().optional(),
  photos: z.array(z.string().url()).optional(),
  description: z.string().min(1).max(2000),
  animalTypeId: optionalPositiveInt,
  animalType: catalogReference.optional(),
  date: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  latitud: z.number().optional().nullable(),
  longitud: z.number().optional().nullable(),
  contactPhone: z.string().min(1).max(30),
  contactEmail: z.string().email().max(120),
  sexId: optionalPositiveInt,
  sex: catalogReference.optional(),
  breed: z.string().max(120).nullable().optional(),
  ageMonths: z.number().int().nonnegative().nullable().optional(),
  color: z.string().max(80).nullable().optional(),
  weightKg: z.number().nonnegative().nullable().optional(),
  heightCm: z.number().nonnegative().nullable().optional(),
  hasCollar: z.boolean().nullable().optional(),
  hasTag: z.boolean().nullable().optional(),
  microchipped: z.boolean().nullable().optional(),
  neutered: z.boolean().nullable().optional(),
  vaccinated: z.boolean().nullable().optional(),
  friendlyWithKids: z.boolean().nullable().optional(),
  friendlyWithPets: z.boolean().nullable().optional(),
  trained: z.boolean().nullable().optional(),
  activityLevelId: optionalPositiveInt,
  activityLevel: catalogReference.optional(),
  reward: z.string().max(120).optional(),
  statusId: optionalPositiveInt,
  status: catalogReference.optional(),
  reportStatusId: optionalPositiveInt,
  reportStatus: catalogReference.optional(),
  medicalStatusId: optionalPositiveInt,
  medicalStatus: catalogReference.optional(),
});

export const petCreateSchema = petBaseSchema.superRefine((value, ctx) => {
  if (!value.animalTypeId && value.animalType === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["animalTypeId"],
      message: "Requerido",
    });
  }
});

export const petUpdateSchema = petBaseSchema
  .omit({ id: true, createdAt: true, userId: true })
  .partial();

export const petNoteCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  kindId: optionalPositiveInt,
  kind: catalogReference.optional(),
});

export type PetCreateInput = z.infer<typeof petCreateSchema>;
export type PetUpdateInput = z.infer<typeof petUpdateSchema>;
export type PetNoteCreateInput = z.infer<typeof petNoteCreateSchema>;
