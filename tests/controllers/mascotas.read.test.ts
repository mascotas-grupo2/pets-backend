import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes, mockReq, authReq } from "../helpers/express.js";
import { makePet } from "../factories.js";

const findOneBy = vi.fn();
const findBy = vi.fn();
const find = vi.fn();
const createQueryBuilder = vi.fn(() => ({
  where() {
    return this;
  },
  andWhere() {
    return this;
  },
  orderBy() {
    return this;
  },
  getMany: async () => [],
  getRawMany: async () => [],
}));

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findOneBy, findBy, find, createQueryBuilder });
  // El código pasa por dbManager() -> AppDataSource.manager.getRepository(...),
  // así que exponemos el mismo repo tanto en getRepository como en manager.
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

import {
  getMascota,
  listMascotasByIds,
} from "../../src/controllers/mascotas.controller.js";

beforeEach(() => {
  findOneBy.mockReset();
  findBy.mockReset();
  find.mockReset();
  find.mockResolvedValue([]);
});

describe("getMascota", () => {
  it("404 si no existe", async () => {
    findOneBy.mockResolvedValue(null);
    const res = mockRes();
    await getMascota(mockReq({ params: { id: "x" } as any }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("devuelve la mascota si esta activa", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.activo });
    findOneBy.mockResolvedValue(pet);
    const res = mockRes();
    await getMascota(mockReq({ params: { id: pet.id } as any }), res);
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it("404 si esta pendiente y el solicitante no esta autenticado", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente });
    findOneBy.mockResolvedValue(pet);
    const res = mockRes();
    await getMascota(mockReq({ params: { id: pet.id } as any }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("404 si esta pendiente y el solicitante NO es el dueno (anti-IDOR)", async () => {
    const pet = makePet({
      reportStatusId: CatalogIds.petReportStatus.pendiente,
      userId: 5,
    });
    findOneBy.mockResolvedValue(pet);
    const res = mockRes();
    await getMascota(
      authReq({ id: 99 }, { params: { id: pet.id } as any }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Pet no encontrada" });
  });

  it("permite al dueno ver su reporte pendiente", async () => {
    const pet = makePet({
      reportStatusId: CatalogIds.petReportStatus.pendiente,
      userId: 5,
    });
    findOneBy.mockResolvedValue(pet);
    const res = mockRes();
    await getMascota(
      authReq({ id: 5 }, { params: { id: pet.id } as any }),
      res,
    );
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
  });

  it("permite al admin ver reportes pendientes ajenos", async () => {
    const pet = makePet({
      reportStatusId: CatalogIds.petReportStatus.pendiente,
      userId: 5,
    });
    findOneBy.mockResolvedValue(pet);
    const res = mockRes();
    await getMascota(
      authReq({ id: 99, role: "admin" }, { params: { id: pet.id } as any }),
      res,
    );
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
  });
});

describe("listMascotasByIds", () => {
  it("devuelve [] si no se envian ids", async () => {
    const res = mockRes();
    await listMascotasByIds(mockReq({ body: { ids: [] } }), res);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(findBy).not.toHaveBeenCalled();
  });

  it("devuelve [] si body.ids no es un array", async () => {
    const res = mockRes();
    await listMascotasByIds(mockReq({ body: {} }), res);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("filtra mascotas no visibles para el solicitante", async () => {
    const visible = makePet({
      id: "v-1",
      reportStatusId: CatalogIds.petReportStatus.activo,
    });
    const oculta = makePet({
      id: "h-1",
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.pendiente,
    });
    findBy.mockResolvedValue([visible, oculta]);

    const res = mockRes();
    await listMascotasByIds(
      authReq({ id: 99 }, { body: { ids: ["v-1", "h-1"] } }),
      res,
    );

    const sent = res.json.mock.calls[0][0] as any[];
    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe("v-1");
  });

  it("el dueno ve sus pendientes", async () => {
    const pendingMine = makePet({
      id: "p-1",
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.pendiente,
    });
    findBy.mockResolvedValue([pendingMine]);

    const res = mockRes();
    await listMascotasByIds(
      authReq({ id: 5 }, { body: { ids: ["p-1"] } }),
      res,
    );

    const sent = res.json.mock.calls[0][0] as any[];
    expect(sent).toHaveLength(1);
  });

  it("admin ve todas las mascotas pedidas", async () => {
    const a = makePet({ id: "a-1", reportStatusId: CatalogIds.petReportStatus.pendiente, userId: 1 });
    const b = makePet({ id: "b-1", reportStatusId: CatalogIds.petReportStatus.rechazado, userId: 2 });
    const c = makePet({ id: "c-1", reportStatusId: CatalogIds.petReportStatus.activo });
    findBy.mockResolvedValue([a, b, c]);

    const res = mockRes();
    await listMascotasByIds(
      authReq({ id: 99, role: "admin" }, { body: { ids: ["a-1", "b-1", "c-1"] } }),
      res,
    );

    const sent = res.json.mock.calls[0][0] as any[];
    expect(sent).toHaveLength(3);
  });
});
