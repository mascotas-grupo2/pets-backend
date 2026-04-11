import { z } from "zod";

export const petCreateSchema = z.object({
  name: z.string().min(1).max(80),
  species: z.enum(["DOG", "CAT", "BIRD", "RABBIT", "OTHER"]),
  breed: z.string().max(80).optional(),
  age: z.number().int().nonnegative().optional(),
  ownerName: z.string().max(120).optional(),
});

export const petUpdateSchema = petCreateSchema.partial();

export type PetCreateInput = z.infer<typeof petCreateSchema>;
export type PetUpdateInput = z.infer<typeof petUpdateSchema>;
