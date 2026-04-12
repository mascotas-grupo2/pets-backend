import { z } from "zod";
import { Especie, Estado } from "../entity/Mascota.js";

export const mascotaCreateSchema = z.object({
  nombre: z.string().min(1).max(80).optional(),
  especie: z.nativeEnum(Especie),
  estado: z.nativeEnum(Estado),
  raza: z.string().max(80).optional(),
  edad: z.number().int().nonnegative().optional(),
  descripcion: z.string().max(500).optional(),
  direccion: z.string().max(200).optional(),
});

export const mascotaUpdateSchema = mascotaCreateSchema.partial();

export type MascotaCreateInput = z.infer<typeof mascotaCreateSchema>;
export type MascotaUpdateInput = z.infer<typeof mascotaUpdateSchema>;
