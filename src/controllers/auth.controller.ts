import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entity/User.js";
import {
  forgotPasswordSchema,
  googleSsoSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../schemas/auth.schema.js";
import { publicUser } from "./user.controller.js";
import {
  clearAuthCookies,
  createRefreshToken,
  getRequestToken,
  hashToken,
  issueAuthTokens,
  setAuthCookies,
  verifyKeycloakToken
} from "../lib/auth.js";
import { isAdminEmail } from "../lib/bootstrap-admins.js";
import crypto from "crypto";
import { sendPasswordResetMail, sendVerificationMail } from "../lib/mailer.js";

function userRepo() {
  return AppDataSource.getRepository(User);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verificationUrl(token: string) {
  const frontendUrl = process.env.BASE_URL ?? process.env.FRONT_HOST;
  if (!frontendUrl) return undefined;
  const url = new URL("/auth", frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function resetPasswordUrl(token: string) {
  const frontendUrl = process.env.BASE_URL ?? process.env.FRONT_HOST;
  if (!frontendUrl) return undefined;
  return new URL(`/forgot-password/${token}`, frontendUrl).toString();
}

function authResponse(user: User, token: string, refreshToken: string, extra: Record<string, unknown> = {}) {
  const safeUser = publicUser(user);
  return {
    user: safeUser,
    token, // Token local (pequeño y eficiente)
    refreshToken,
    ...extra,
  };
}

function requestRefreshToken(req: Request) {
  const parsed = refreshTokenSchema.safeParse(req.body ?? {});
  if (parsed.success && parsed.data.refreshToken) return parsed.data.refreshToken;
  console.log("[Auth] Buscando refresh_token en cookies:", !!req.cookies?.refresh_token);
  return req.cookies?.refresh_token;
}

async function saveIssuedTokens(user: User) {
  const tokens = await issueAuthTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  await userRepo().save(user);
  return tokens;
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, email, password } = parsed.data;
  const existing = await userRepo().findOneBy({ email });
  if (existing) return res.status(409).json({ error: "Email ya registrado" });

  const { salt, hash } = hashPassword(password);
  const verificationToken = createRefreshToken();
  const user = userRepo().create({
    name,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    emailVerificationTokenHash: hashToken(verificationToken),
    role: isAdminEmail(email) ? UserRole.ADMIN : UserRole.USER,
  });
  const saved = await userRepo().save(user);

  // Enviar correo de verificación
  const url = verificationUrl(verificationToken);
  if (url) {
    try {
      await sendVerificationMail(saved.email, saved.name, url);
      console.log(`[Register] Email de verificación enviado a: ${saved.email}`);
    } catch (error) {
      console.error(`[Register] Error al enviar email a ${saved.email}:`, error);
    }
  }

  console.log(`[Register] Usuario creado (pendiente de verificación): ${saved.email}`);
  res.status(201).json({
    message: "Registro exitoso. Revisa tu correo electrónico para verificar tu cuenta.",
    email: saved.email
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  console.log(`[Login] Intento de login para: ${email}`);

  const existing = await userRepo().findOneBy({ email });
  if (!existing) return res.status(401).json({ error: "Credenciales invalidas" });

  const hash = crypto.pbkdf2Sync(password, existing.passwordSalt, 310000, 32, "sha256").toString("hex");
  if (hash !== existing.passwordHash) return res.status(401).json({ error: "Credenciales invalidas" });

  const tokens = await saveIssuedTokens(existing);
  setAuthCookies(res, tokens.token, tokens.refreshToken);

  console.log(`[Login] Login exitoso para: ${email}`);
  res.json(authResponse(existing, tokens.token, tokens.refreshToken));
}

export async function refreshToken(req: Request, res: Response) {
  const currentRefreshToken = requestRefreshToken(req);
  if (!currentRefreshToken) return res.status(401).json({ error: "Falta refresh token" });

  const existing = await userRepo().findOneBy({ refreshTokenHash: hashToken(currentRefreshToken) });
  if (!existing) return res.status(401).json({ error: "Refresh token invalido" });

  const tokens = await saveIssuedTokens(existing);
  setAuthCookies(res, tokens.token, tokens.refreshToken);

  console.log(`[RefreshToken] Tokens renovados para usuario: ${existing.email}`);
  res.json(authResponse(existing, tokens.token, tokens.refreshToken));
}

export async function logout(req: Request, res: Response) {
  const refreshToken = requestRefreshToken(req);
  if (refreshToken) {
    const existing = await userRepo().findOneBy({ refreshTokenHash: hashToken(refreshToken) });
    console.log(`[Logout] Cerrando sesión para: ${existing?.email ?? "token desconocido"}`);
    if (existing) {
      existing.refreshTokenHash = null;
      await userRepo().save(existing);
    }
  }
  clearAuthCookies(res);
  res.status(204).send();
}

export async function verifyEmail(req: Request, res: Response) {
  const parsed = verifyEmailSchema.safeParse({ token: req.body?.token ?? req.query.token });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await userRepo().findOneBy({
    emailVerificationTokenHash: hashToken(parsed.data.token),
  });
  if (!existing) return res.status(400).json({ error: "Token de verificacion invalido" });

  existing.emailVerified = true;
  existing.emailVerificationTokenHash = null;
  const saved = await userRepo().save(existing);
  // Issue auth tokens and set them in cookies, then return minimal public info
  const tokens = await saveIssuedTokens(saved);
  setAuthCookies(res, tokens.token, tokens.refreshToken);
  res.json(authResponse(saved, tokens.token, tokens.refreshToken));
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const email = parsed.data.email;
  const existing = await userRepo().findOneBy({ email });

  if (existing) {
    const resetToken = createRefreshToken();
    existing.passwordResetTokenHash = hashToken(resetToken);
    existing.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await userRepo().save(existing);

    const url = resetPasswordUrl(resetToken);
    if (url) {
      try {
        await sendPasswordResetMail(existing.email, existing.name, url);
        console.log(`[ForgotPassword] Email de recuperacion enviado a: ${existing.email}`);
      } catch (error) {
        console.error(`[ForgotPassword] Error al enviar email a ${existing.email}:`, error);
      }
    }
  }

  res.status(204).send();
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await userRepo().findOneBy({
    passwordResetTokenHash: hashToken(parsed.data.token),
  });
  if (!existing || !existing.passwordResetExpiresAt || existing.passwordResetExpiresAt <= new Date()) {
    return res.status(400).json({ error: "Token de recuperacion invalido o expirado" });
  }

  const password = hashPassword(parsed.data.newPassword);
  existing.passwordHash = password.hash;
  existing.passwordSalt = password.salt;
  existing.passwordResetTokenHash = null;
  existing.passwordResetExpiresAt = null;
  existing.refreshTokenHash = null;
  await userRepo().save(existing);

  clearAuthCookies(res);
  res.status(204).send();
}

export async function ssoSync(req: Request, res: Response) {
  const parsed = googleSsoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    console.log("[ssoSync] Iniciando sincronización SSO");
    const token = parsed.data.idToken ?? parsed.data.token ?? parsed.data.accessToken ?? getRequestToken(req);
    if (!token) return res.status(400).json({ error: "Token requerido" });

    const payload = await verifyKeycloakToken(token);
    console.log("[ssoSync] Token Keycloak validado para:", payload.email);

    const email = typeof payload.email === "string" ? payload.email : null;
    const subject = payload.sub;
    if (!email || !subject) return res.status(401).json({ error: "Token SSO Keycloak invalido" });

    let user = await userRepo().findOneBy({ ssoProvider: "keycloak", ssoSubject: subject });
    if (!user) user = await userRepo().findOneBy({ email });
    if (!user) {
      const password = hashPassword(createRefreshToken());
      user = userRepo().create({
        name: typeof payload.name === "string" ? payload.name : email,
        email,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        role: isAdminEmail(email) ? UserRole.ADMIN : UserRole.USER,
      });
    } else if (user.role !== UserRole.ADMIN && isAdminEmail(email)) {
      user.role = UserRole.ADMIN;
    }

    user.ssoProvider = "keycloak";
    user.ssoSubject = subject;
    user.emailVerified = payload.email_verified === true;
    if (typeof payload.picture === "string") user.photo = payload.picture;

    const saved = await userRepo().save(user);
    const tokens = await saveIssuedTokens(saved);

    const response = authResponse(saved, tokens.token, tokens.refreshToken);
    console.log(`[ssoSync] Usuario sincronizado: ${saved.email}. Payload size: ${JSON.stringify(response).length} bytes`);

    res.json(response);
  } catch (err) {
    console.error("[ssoSync] Error crítico:", err instanceof Error ? err.message : err);
    res.status(401).json({ error: "Token SSO Keycloak invalido" });
  }
}

export const googleSso = ssoSync;
