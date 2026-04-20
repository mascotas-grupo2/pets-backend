import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const issuer = process.env.KEYCLOAK_ISSUER;
const audience = process.env.KEYCLOAK_AUDIENCE;

if (!issuer) {
  throw new Error("Falta la variable de entorno KEYCLOAK_ISSUER");
}

const jwks = createRemoteJWKSet(
  new URL(`${issuer.replace(/\/$/, "")}/protocol/openid-connect/certs`)
);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Falta token Bearer" });
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      // Keycloak emite tokens con `aud` opcional; si está configurado, validamos.
      ...(audience ? { audience } : {}),
    });
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}
