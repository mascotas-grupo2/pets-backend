import { describe, it, expect, vi, beforeEach } from "vitest";
import { FindOperator } from "typeorm";
import { mockRes, authReq } from "../helpers/express.js";

const findOne = vi.fn();

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findOne });
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(),
  resolveCatalogValueId: vi.fn(async () => null),
  CatalogValidationError: class CatalogValidationError extends Error {},
}));
vi.mock("../../src/lib/minio.js", () => ({
  uploadBufferToMinio: vi.fn(),
  uploadDataUrlToMinio: vi.fn(),
  uploadFileToMinio: vi.fn(),
  createFolderInBucket: vi.fn(),
}));
vi.mock("../../src/lib/geocoding.js", () => ({
  geocodificarDireccion: vi.fn(),
}));

import { getAdminPetById } from "../../src/controllers/mascotas.controller.js";

const refugioAdmin = { id: 2, role: "admin", refugioId: 7 };
const superadmin = { id: 1, role: "superadmin" };

beforeEach(() => {
  findOne.mockReset();
});

describe("getAdminPetById - scope multi-tenant", () => {
  it("el admin de refugio consulta con visibilidad (su refugio O públicas)", async () => {
    findOne.mockResolvedValue(null); // fuera de alcance → 404
    const res = mockRes();
    await getAdminPetById(authReq(refugioAdmin, { params: { id: "p1" } as any }), res);

    const where = findOne.mock.calls[0][0].where;
    expect(Array.isArray(where)).toBe(true);
    expect(where[0]).toMatchObject({ id: "p1", refugioId: 7 });
    expect(where[1].refugioId).toBeInstanceOf(FindOperator); // refugioId IS NULL
  });

  it("404 cuando la mascota no es visible para el refugio (anti cross-tenant)", async () => {
    findOne.mockResolvedValue(null);
    const res = mockRes();
    await getAdminPetById(authReq(refugioAdmin, { params: { id: "ajena" } as any }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("el superadmin consulta por id sin filtro de refugio", async () => {
    findOne.mockResolvedValue(null);
    const res = mockRes();
    await getAdminPetById(authReq(superadmin, { params: { id: "p1" } as any }), res);

    const where = findOne.mock.calls[0][0].where;
    expect(Array.isArray(where)).toBe(false);
    expect(where).toEqual({ id: "p1" });
  });

  it("404 si el id es inválido (findOne lanza)", async () => {
    findOne.mockRejectedValue(new Error("invalid input syntax for uuid"));
    const res = mockRes();
    await getAdminPetById(authReq(refugioAdmin, { params: { id: "x" } as any }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
