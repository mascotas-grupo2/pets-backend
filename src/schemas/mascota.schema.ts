import { z } from "zod";
import { AnimalType, PetSex } from "../entity/Pet";

export const petCreateSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  userId: z.number().int().positive().optional(),
  name: z.string().min(1).max(120).optional(),
  photo: z.string().min(1).nullable().optional(),
  photos: z.array(z.string().url()).optional(),
  description: z.string().min(1).max(2000),
  animalType: z.nativeEnum(AnimalType),
  date: z.string().min(1).max(200),
  location: z.string().min(1).max(200),
  contactPhone: z.string().min(1).max(30),
  contactEmail: z.string().email().max(120),
  sex: z.nativeEnum(PetSex).optional(),
  breed: z.string().max(120).optional(),
  ageMonths: z.number().int().nonnegative().optional(),
  color: z.string().max(80).optional(),
  weightKg: z.number().nonnegative().optional(),
  heightCm: z.number().nonnegative().optional(),
  hasCollar: z.boolean().optional(),
  hasTag: z.boolean().optional(),
  microchipped: z.boolean().optional(),
  neutered: z.boolean().optional(),
  vaccinated: z.boolean().optional(),
  friendlyWithKids: z.boolean().optional(),
  trained: z.boolean().optional(),
  reward: z.string().max(120).optional(),
});

export const petUpdateSchema = petCreateSchema.partial();

export type PetCreateInput = z.infer<typeof petCreateSchema>;
export type PetUpdateInput = z.infer<typeof petUpdateSchema>;
