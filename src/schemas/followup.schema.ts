import { z } from "zod";

export const followupCreateSchema = z.object({
  petId: z.string().uuid(),
  userId: z.number().int().positive(),
  typeId: z.number().int().positive(),
  appointmentAt: z.coerce.date().refine((date) => date > new Date(), {
    message: "La fecha de seguimiento debe ser mayor a la actual",
  }),
});

export const followupListQuerySchema = z.object({
  petId: z.string().uuid().optional(),
  userId: z.coerce.number().int().positive().optional(),
  typeId: z.coerce.number().int().positive().optional(),
  statusId: z.coerce.number().int().positive().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const followupUpdateSchema = z.object({
  petId: z.string().uuid().optional(),
  userId: z.number().int().positive().optional(),
  typeId: z.number().int().positive().optional(),
  appointmentAt: z.coerce.date().optional(),
  statusId: z.number().int().positive().optional(),
});

export type FollowupCreateInput = z.infer<typeof followupCreateSchema>;
export type FollowupListQuery = z.infer<typeof followupListQuerySchema>;
export type FollowupUpdateInput = z.infer<typeof followupUpdateSchema>;
