import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import crypto from "crypto";
import { User } from "../entity/User.js";
import { AppDataSource } from "../data-source.js";
import { CatalogIds, catalogCodeForId } from "./catalog-constants.js";

const issuer = process.env.KEYCLOAK_ISSUER;
const audience = process.env.KEYCLOAK_AUDIENCE;
const localIssuer = process.env.JWT_ISSUER ?? "pets-backend";
const jwtSecretValue = process.env.JWT_SECRET;

if (!jwtSecretValue) {
  throw new Error("Falta la variable de entorno JWT_SECRET");
}

const jwtSecret = new TextEncoder().encode(jwtSecretValue);

const jwks = issuer
  ? createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`))
  : null;

export type AuthUser = {
  id: number;
  email?: string;
  role?: string;
  provider?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      authUser?: AuthUser;
    }
  }
}

export function getRequestToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return req.cookies?.auth_token;
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export async function createAccessToken(user: User) {
  return new SignJWT({
    email: user.email,
    role: catalogCodeForId(user.roleId) ?? "user",
    provider: catalogCodeForId(user.ssoProviderId) ?? "local",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(localIssuer)
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? "1h")
    .sign(jwtSecret);
}

export function setAuthCookies(res: Response, token: string, refreshToken: string) {
  const secure = process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  const sameSite = secure ? "none" : "lax";
  res.cookie("auth_token", token, {
    httpOnly: false,
    sameSite,
    secure,
    path: "/",
    maxAge: 60 * 60 * 1000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("auth_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}

export async function issueAuthTokens(user: User) {
  const token = await createAccessToken(user);
  const refreshToken = createRefreshToken();
  return { token, refreshToken };
}

async function authUserFromPayload(payload: JWTPayload): Promise<AuthUser | null> {
  const id = Number(payload.sub);
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const role = typeof payload.role === "string" ? payload.role : undefined;
  const provider = typeof payload.provider === "string" ? payload.provider : undefined;

  if (Number.isInteger(id)) {
    return { id, email, role, provider };
  }

  if (!payload.sub) return null;

  const userRepo = AppDataSource.getRepository(User);
  const user =
    (await userRepo.findOneBy({
      ssoProviderId: CatalogIds.ssoProvider.keycloak,
      ssoSubject: payload.sub,
    })) ??
    (email ? await userRepo.findOneBy({ email }) : null);

  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: catalogCodeForId(user.roleId) ?? "user",
    provider: catalogCodeForId(user.ssoProviderId) ?? "keycloak",
  };
}

async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, jwtSecret, { issuer: localIssuer });
    return payload;
  } catch {
    return verifyKeycloakToken(token);
  }
}

export async function verifyKeycloakToken(token: string) {
  if (!jwks || !issuer) throw new Error("Token invalido o expirado");
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    ...(audience ? { audience } : {}),
  });
  return payload;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getRequestToken(req);
  if (!token) return next();

  try {
    const payload = await verifyToken(token);
    req.user = payload;
    req.authUser = (await authUserFromPayload(payload)) ?? undefined;
  } catch {
    req.user = undefined;
    req.authUser = undefined;
  }
  return next();
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: "Falta token Bearer" });

  try {
    const payload = await verifyToken(token);
    const authUser = await authUserFromPayload(payload);
    if (!authUser) return res.status(401).json({ error: "Token invalido o expirado" });
    req.user = payload;
    req.authUser = authUser;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = getRequestToken(req);
  if (!token) return res.status(401).json({ error: "Falta token Bearer" });

  try {
    const payload = await verifyToken(token);
    const authUser = await authUserFromPayload(payload);
    if (!authUser) return res.status(401).json({ error: "Token invalido o expirado" });
    if (authUser.role !== "admin") {
      return res.status(403).json({ error: "Se requiere rol de administrador" });
    }
    req.user = payload;
    req.authUser = authUser;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}
