import { z } from "zod";

const yesNo = z.enum(["si", "no", ""]);
const yesNoNA = z.enum(["si", "no", "na", ""]);

export const adoptionSchema = z.object({
  userId: z.number().int().positive().optional(),
  petId: z.string().uuid().optional(),
  preferredAnimal: z.enum(["perro", "gato", "otro", ""]),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().min(1).max(30),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().default(""),
  postcode: z.string().min(1).max(20),
  town: z.string().min(1).max(120),
  hasGarden: yesNo,
  livingSituation: z.enum(["", "casa", "departamento", "phd", "quinta", "otro"]),
  householdSetting: z.enum(["", "urbano", "suburbano", "rural"]),
  activityLevel: z.enum(["", "tranquilo", "moderado", "activo"]),
  adults: z.number().int().nonnegative(),
  children: z.number().int().nonnegative(),
  visitingChildren: yesNo,
  hasFlatmates: yesNo,
  allergies: z.string().max(2000).optional().default(""),
  otherAnimals: yesNo,
  otherAnimalsDetail: z.string().max(2000).optional().default(""),
  neutered: yesNoNA,
  vaccinated: yesNoNA,
  experience: z.string().max(2000).optional().default(""),
  acceptsTerms: z.boolean(),
});

export type AdoptionInput = z.infer<typeof adoptionSchema>;
