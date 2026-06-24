import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  googleSsoSchema,
} from "../../src/schemas/auth.schema.js";

describe("registerSchema", () => {
  it("acepta un registro valido", () => {
    const r = registerSchema.safeParse({
      name: "Juan Perez",
      email: "juan@example.com",
      password: "secret123",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza name de menos de 2 caracteres", () => {
    const r = registerSchema.safeParse({
      name: "J",
      email: "j@e.com",
      password: "secret123",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza name de mas de 120 caracteres", () => {
    const r = registerSchema.safeParse({
      name: "a".repeat(121),
      email: "j@e.com",
      password: "secret123",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza email invalido", () => {
    const r = registerSchema.safeParse({
      name: "Juan",
      email: "no-es-email",
      password: "secret123",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza password de menos de 8 caracteres", () => {
    const r = registerSchema.safeParse({
      name: "Juan",
      email: "j@e.com",
      password: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza password de mas de 128 caracteres", () => {
    const r = registerSchema.safeParse({
      name: "Juan",
      email: "j@e.com",
      password: "a".repeat(129),
    });
    expect(r.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("acepta credenciales validas", () => {
    const r = loginSchema.safeParse({ email: "j@e.com", password: "secret123" });
    expect(r.success).toBe(true);
  });

  it("rechaza si falta email", () => {
    const r = loginSchema.safeParse({ password: "secret123" });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta password", () => {
    const r = loginSchema.safeParse({ email: "j@e.com" });
    expect(r.success).toBe(false);
  });
});

describe("refreshTokenSchema", () => {
  it("acepta payload sin refreshToken (opcional)", () => {
    const r = refreshTokenSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("acepta refreshToken con minimo 20 caracteres", () => {
    const r = refreshTokenSchema.safeParse({ refreshToken: "a".repeat(20) });
    expect(r.success).toBe(true);
  });

  it("rechaza refreshToken con menos de 20 caracteres", () => {
    const r = refreshTokenSchema.safeParse({ refreshToken: "tooshort" });
    expect(r.success).toBe(false);
  });
});

describe("verifyEmailSchema", () => {
  it("acepta token con minimo 20 caracteres", () => {
    const r = verifyEmailSchema.safeParse({ token: "a".repeat(20) });
    expect(r.success).toBe(true);
  });

  it("rechaza token corto", () => {
    const r = verifyEmailSchema.safeParse({ token: "short" });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta token", () => {
    const r = verifyEmailSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("acepta email valido", () => {
    const r = forgotPasswordSchema.safeParse({ email: "j@e.com" });
    expect(r.success).toBe(true);
  });

  it("rechaza email invalido", () => {
    const r = forgotPasswordSchema.safeParse({ email: "no-es-email" });
    expect(r.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("acepta token + newPassword validos", () => {
    const r = resetPasswordSchema.safeParse({
      token: "a".repeat(20),
      newPassword: "secret123",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza newPassword corta", () => {
    const r = resetPasswordSchema.safeParse({
      token: "a".repeat(20),
      newPassword: "short",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza si falta token", () => {
    const r = resetPasswordSchema.safeParse({ newPassword: "secret123" });
    expect(r.success).toBe(false);
  });
});

describe("googleSsoSchema", () => {
  it("acepta payload vacio (todos opcionales)", () => {
    const r = googleSsoSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("acepta solo idToken", () => {
    const r = googleSsoSchema.safeParse({ idToken: "a".repeat(20) });
    expect(r.success).toBe(true);
  });

  it("acepta los tres campos", () => {
    const r = googleSsoSchema.safeParse({
      idToken: "a".repeat(20),
      token: "b".repeat(20),
      accessToken: "c".repeat(20),
    });
    expect(r.success).toBe(true);
  });

  it("rechaza idToken con menos de 20 caracteres", () => {
    const r = googleSsoSchema.safeParse({ idToken: "short" });
    expect(r.success).toBe(false);
  });
});
