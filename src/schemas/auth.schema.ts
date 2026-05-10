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

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(20),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const googleSsoSchema = z.object({
  idToken: z.string().min(20).optional(),
  token: z.string().min(20).optional(),
  accessToken: z.string().min(20).optional(),
});

export type GoogleSsoInput = z.infer<typeof googleSsoSchema>;
