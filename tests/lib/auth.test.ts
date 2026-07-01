import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes } from "../helpers/express.js";
import { makeUser } from "../factories.js";

const userFindOneBy = vi.fn();

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findOneBy: userFindOneBy });
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

import {
  getRequestToken,
  hashToken,
  createRefreshToken,
  createAccessToken,
  requireAuth,
  requireAdmin,
  optionalAuth,
} from "../../src/lib/auth.js";

function reqWithHeader(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
  } as any;
}

function reqWithCookie(token?: string) {
  return {
    headers: {},
    cookies: token ? { auth_token: token } : {},
  } as any;
}

beforeEach(() => {
  userFindOneBy.mockReset();
});

describe("getRequestToken", () => {
  it("extrae token desde header Bearer", () => {
    const req = reqWithHeader("abc.xyz");
    expect(getRequestToken(req)).toBe("abc.xyz");
  });

  it("trimea espacios del header Bearer", () => {
    const req: any = {
      headers: { authorization: "Bearer   abc.xyz  " },
      cookies: {},
    };
    expect(getRequestToken(req)).toBe("abc.xyz");
  });

  it("extrae token desde cookie auth_token", () => {
    const req = reqWithCookie("from-cookie");
    expect(getRequestToken(req)).toBe("from-cookie");
  });

  it("prefiere el header sobre la cookie", () => {
    const req: any = {
      headers: { authorization: "Bearer header-token" },
      cookies: { auth_token: "cookie-token" },
    };
    expect(getRequestToken(req)).toBe("header-token");
  });

  it("devuelve undefined sin header ni cookie", () => {
    const req: any = { headers: {}, cookies: {} };
    expect(getRequestToken(req)).toBeUndefined();
  });

  it("ignora esquema distinto a Bearer", () => {
    const req: any = {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
      cookies: {},
    };
    expect(getRequestToken(req)).toBeUndefined();
  });
});

describe("hashToken", () => {
  it("es determinista para el mismo input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("produce SHA-256 hex de 64 caracteres", () => {
    const h = hashToken("test-token");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("entrega hashes distintos para inputs distintos", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("createRefreshToken", () => {
  it("genera tokens distintos en cada llamada", () => {
    const a = createRefreshToken();
    const b = createRefreshToken();
    expect(a).not.toBe(b);
  });

  it("genera tokens base64url de longitud razonable", () => {
    const t = createRefreshToken();
    expect(t.length).toBeGreaterThan(40);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("requireAuth", () => {
  it("401 si no hay token", async () => {
    const next = vi.fn();
    const res = mockRes();
    await requireAuth(reqWithHeader(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 si el token es invalido", async () => {
    const next = vi.fn();
    const res = mockRes();
    await requireAuth(reqWithHeader("garbage.no.es.jwt"), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("acepta un token valido y setea req.authUser", async () => {
    const user = makeUser({ id: 5, email: "u@e.com", roleId: CatalogIds.userRole.user });
    const token = await createAccessToken(user);

    const req = reqWithHeader(token);
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser).toMatchObject({ id: 5, email: "u@e.com", role: "user" });
  });

  it("acepta token tambien via cookie", async () => {
    const user = makeUser({ id: 8 });
    const token = await createAccessToken(user);

    const req = reqWithCookie(token);
    const res = mockRes();
    const next = vi.fn();
    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser?.id).toBe(8);
  });
});

describe("requireAdmin", () => {
  it("401 si no hay token", async () => {
    const next = vi.fn();
    const res = mockRes();
    await requireAdmin(reqWithHeader(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401 si el token es invalido", async () => {
    const next = vi.fn();
    const res = mockRes();
    await requireAdmin(reqWithHeader("no-es-jwt"), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("403 si el usuario NO es admin", async () => {
    const regularUser = makeUser({ id: 5, roleId: CatalogIds.userRole.user });
    const token = await createAccessToken(regularUser);

    const next = vi.fn();
    const res = mockRes();
    await requireAdmin(reqWithHeader(token), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Se requiere rol de administrador",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("acepta token de un admin", async () => {
    const admin = makeUser({ id: 1, roleId: CatalogIds.userRole.admin });
    const token = await createAccessToken(admin);

    const req = reqWithHeader(token);
    const res = mockRes();
    const next = vi.fn();
    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser?.role).toBe("admin");
  });
});

describe("optionalAuth", () => {
  it("continua sin authUser si no hay token", async () => {
    const req: any = reqWithHeader();
    const res = mockRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser).toBeUndefined();
  });

  it("continua sin authUser si el token es invalido (no rechaza)", async () => {
    const req: any = reqWithHeader("invalid-token");
    const res = mockRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser).toBeUndefined();
  });

  it("setea authUser si el token es valido", async () => {
    const user = makeUser({ id: 7 });
    const token = await createAccessToken(user);

    const req: any = reqWithHeader(token);
    const res = mockRes();
    const next = vi.fn();
    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authUser?.id).toBe(7);
  });
});
