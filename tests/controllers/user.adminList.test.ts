import { describe, it, expect, vi, beforeEach } from "vitest";
import { ILike } from "typeorm";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes, authReq } from "../helpers/express.js";
import { makeUser } from "../factories.js";

const findAndCount = vi.fn();
const count = vi.fn(async () => 0);
const find = vi.fn(async () => []);

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findAndCount, count, find });
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

// Estos tests cubren la lógica de filtros / paginación / serialización, no el
// scope multi-tenant. Corren como superadmin para aislar esa lógica del
// filtrado por refugio (el scope tiene su propio archivo de tests).
const mockReq = (overrides: any = {}) =>
  authReq({ id: 1, role: "superadmin" }, overrides);

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(),
  resolveCatalogValueId: vi.fn(),
  CatalogValidationError: class CatalogValidationError extends Error {},
}));

vi.mock("../../src/lib/minio.js", () => ({
  uploadFileToMinio: vi.fn(),
}));

import { adminListUsers } from "../../src/controllers/user.controller.js";

function ilikeValue(like: any): string {
  return (like as any)._value ?? (like as any).value ?? String(like);
}

beforeEach(() => {
  findAndCount.mockReset();
  findAndCount.mockResolvedValue([[], 0]);
  count.mockReset();
  count.mockResolvedValue(0);
});

describe("adminListUsers - validacion y defaults", () => {
  it("400 si page no es entero positivo", async () => {
    const res = mockRes();
    await adminListUsers(mockReq({ query: { page: "0" } as any }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("aplica defaults page=1 pageSize=20", async () => {
    findAndCount.mockResolvedValue([[makeUser()], 1]);
    const res = mockRes();
    await adminListUsers(mockReq({ query: {} as any }), res);

    const call = findAndCount.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
    const body = res.json.mock.calls[0][0];
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  it("calcula skip correctamente para page=3 pageSize=10", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { page: "3", pageSize: "10" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });

  it("clamp pageSize maximo en 100", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { pageSize: "500" } as any }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("adminListUsers - filtros", () => {
  it("sin filtros: where es objeto vacio", async () => {
    const res = mockRes();
    await adminListUsers(mockReq({ query: {} as any }), res);

    const call = findAndCount.mock.calls[0][0];
    expect(call.where).toEqual({});
  });

  it("filtro por roleId", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { roleId: String(CatalogIds.userRole.admin) } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.where).toMatchObject({ roleId: CatalogIds.userRole.admin });
  });

  it("filtro por adopter true", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { adopter: "true" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.where).toMatchObject({ adopter: true });
  });

  it("filtro por adopter false (acepta 'no')", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { adopter: "no" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.where).toMatchObject({ adopter: false });
  });

  it("filtro por name aplica ILIKE", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { name: "Juan" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.where.name).toBeDefined();
  });

  it("search con filtros especificos ignora el search", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { search: "foo", name: "Juan" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(Array.isArray(call.where)).toBe(false);
    expect(call.where.name).toBeDefined();
  });

  it("search sin filtros especificos genera OR (where como array)", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { search: "juan" } as any }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(Array.isArray(call.where)).toBe(true);
    expect(call.where).toHaveLength(2);
  });

  it("combina roleId + adopter + name", async () => {
    const res = mockRes();
    await adminListUsers(
      mockReq({
        query: {
          roleId: String(CatalogIds.userRole.user),
          adopter: "true",
          name: "Ana",
        } as any,
      }),
      res,
    );

    const call = findAndCount.mock.calls[0][0];
    expect(call.where).toMatchObject({
      roleId: CatalogIds.userRole.user,
      adopter: true,
    });
    expect(call.where.name).toBeDefined();
  });
});

describe("adminListUsers - serializacion", () => {
  it("devuelve items con campos publicos (sin passwordHash)", async () => {
    const user = makeUser({
      id: 5,
      name: "Juan",
      email: "j@e.com",
      roleId: CatalogIds.userRole.admin,
      passwordHash: "secreto-no-mostrar",
    });
    findAndCount.mockResolvedValue([[user], 1]);

    const res = mockRes();
    await adminListUsers(mockReq({ query: {} as any }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    expect(item.id).toBe(5);
    expect(item.email).toBe("j@e.com");
    expect(item.roleId).toBe(CatalogIds.userRole.admin);
    expect(item).not.toHaveProperty("passwordHash");
    expect(item).not.toHaveProperty("passwordSalt");
  });

  it("incluye paginacion en la respuesta", async () => {
    findAndCount.mockResolvedValue([[], 42]);
    const res = mockRes();
    await adminListUsers(
      mockReq({ query: { page: "2", pageSize: "10" } as any }),
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ page: 2, pageSize: 10, total: 42 });
  });
});
