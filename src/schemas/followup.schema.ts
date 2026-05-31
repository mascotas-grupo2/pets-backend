import { z } from "zod";

export const followupCreateSchema = z.object({
  petId: z.string().uuid(),
  userId: z.number().int().positive(),
  typeId: z.number().int().positive(),
  appointmentAt: z.string(),
});

export const followupListQuerySchema = z.object({
  petId: z.string().uuid().optional(),
  userId: z.coerce.number().int().positive().optional(),
  typeId: z.coerce.number().int().positive().optional(),
  statusId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type FollowupCreateInput = z.infer<typeof followupCreateSchema>;
export type FollowupListQuery = z.infer<typeof followupListQuerySchema>;
