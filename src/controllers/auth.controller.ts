import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entity/User.js";
import { registerSchema, loginSchema, refreshTokenSchema, verifyEmailSchema, googleSsoSchema } from "../schemas/auth.schema.js";
import { publicUser } from "./user.controller.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { clearAuthCookies, createRefreshToken, hashToken, issueAuthTokens, setAuthCookies } from "../lib/auth.js";
import crypto from "crypto";

function userRepo() {
  return AppDataSource.getRepository(User);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verificationUrl(token: string) {
  const frontendUrl = process.env.FRONTEND_URL ?? process.env.FRONT_HOST;
  if (!frontendUrl) return undefined;
  const url = new URL("/auth", frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function authResponse(user: User, token: string, refreshToken: string, extra: Record<string, unknown> = {}) {
  const safeUser = publicUser(user);
  return {
    ...safeUser,
    user: safeUser,
    token,
    refreshToken,
    access_token: token,
    refresh_token: refreshToken,
    ...extra,
  };
}

function requestRefreshToken(req: Request) {
  const parsed = refreshTokenSchema.safeParse(req.body ?? {});
  if (parsed.success && parsed.data.refreshToken) return parsed.data.refreshToken;
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === "refresh_token") return decodeURIComponent(value.join("="));
  }
  return undefined;
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
  });
  const saved = await userRepo().save(user);
  const tokens = await saveIssuedTokens(saved);
  setAuthCookies(res, tokens.token, tokens.refreshToken);
  res.status(201).json(authResponse(saved, tokens.token, tokens.refreshToken, {
    verificationToken,
    verificationUrl: verificationUrl(verificationToken),
  }));
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const existing = await userRepo().findOneBy({ email });
  if (!existing) return res.status(401).json({ error: "Credenciales invalidas" });

  const hash = crypto.pbkdf2Sync(password, existing.passwordSalt, 310000, 32, "sha256").toString("hex");
  if (hash !== existing.passwordHash) return res.status(401).json({ error: "Credenciales invalidas" });

  const tokens = await saveIssuedTokens(existing);
  setAuthCookies(res, tokens.token, tokens.refreshToken);
  res.json(authResponse(existing, tokens.token, tokens.refreshToken));
}

export async function refreshToken(req: Request, res: Response) {
  const currentRefreshToken = requestRefreshToken(req);
  if (!currentRefreshToken) return res.status(401).json({ error: "Falta refresh token" });

  const existing = await userRepo().findOneBy({ refreshTokenHash: hashToken(currentRefreshToken) });
  if (!existing) return res.status(401).json({ error: "Refresh token invalido" });

  const tokens = await saveIssuedTokens(existing);
  setAuthCookies(res, tokens.token, tokens.refreshToken);
  res.json(authResponse(existing, tokens.token, tokens.refreshToken));
}

export async function logout(req: Request, res: Response) {
  const refreshToken = requestRefreshToken(req);
  if (refreshToken) {
    const existing = await userRepo().findOneBy({ refreshTokenHash: hashToken(refreshToken) });
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
  res.json(publicUser(saved));
}

export async function googleSso(req: Request, res: Response) {
  const parsed = googleSsoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Falta GOOGLE_CLIENT_ID" });

  try {
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    const { payload } = await jwtVerify(parsed.data.idToken, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    const subject = payload.sub;
    if (!email || !subject) return res.status(401).json({ error: "Token SSO invalido" });

    let user = await userRepo().findOneBy({ ssoProvider: "google", ssoSubject: subject });
    if (!user) user = await userRepo().findOneBy({ email });
    if (!user) {
      const password = hashPassword(createRefreshToken());
      user = userRepo().create({
        name: typeof payload.name === "string" ? payload.name : email,
        email,
        passwordHash: password.hash,
        passwordSalt: password.salt,
        role: UserRole.USER,
      });
    }

    user.ssoProvider = "google";
    user.ssoSubject = subject;
    user.emailVerified = payload.email_verified === true;
    if (typeof payload.picture === "string") user.photo = payload.picture;
    const saved = await userRepo().save(user);
    const tokens = await saveIssuedTokens(saved);
    setAuthCookies(res, tokens.token, tokens.refreshToken);
    res.json(authResponse(saved, tokens.token, tokens.refreshToken));
  } catch {
    res.status(401).json({ error: "Token SSO invalido" });
  }
}
