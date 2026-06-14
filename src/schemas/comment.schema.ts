import { z } from "zod";

export const COMMENT_SECTIONS = [
  "general",
  "salud",
  "comportamiento",
  "avistamiento",
  "contacto",
] as const;

export type CommentSection = (typeof COMMENT_SECTIONS)[number];

export const createCommentSchema = z.object({
  petId: z.string().uuid(),
  section: z.enum(COMMENT_SECTIONS).default("general"),
  content: z.string().min(1).max(5000),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const approveCommentSchema = z.object({
  approved: z.boolean(),
});

export type ApproveCommentInput = z.infer<typeof approveCommentSchema>;
