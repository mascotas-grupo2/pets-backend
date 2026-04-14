import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
