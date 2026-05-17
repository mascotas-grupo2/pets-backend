import { z } from "zod";
import { AnimalType, PetMedicalStatus, PetSex, PetStatus } from "../entity/Pet";
import { PetNoteKind } from "../entity/PetNote";

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
  latitud: z.number().optional().nullable(),
  longitud: z.number().optional().nullable(),
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
  status: z.nativeEnum(PetStatus).optional(),
  medicalStatus: z.nativeEnum(PetMedicalStatus).optional(),
});

export const petUpdateSchema = petCreateSchema
  .omit({ id: true, createdAt: true, userId: true })
  .partial();

export const petNoteCreateSchema = z.object({
  text: z.string().min(1).max(2000),
  kind: z.nativeEnum(PetNoteKind).optional(),
});

export type PetCreateInput = z.infer<typeof petCreateSchema>;
export type PetUpdateInput = z.infer<typeof petUpdateSchema>;
export type PetNoteCreateInput = z.infer<typeof petNoteCreateSchema>;
