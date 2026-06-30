import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes } from "../helpers/express.js";
import { makePet } from "../factories.js";

const findOneBy = vi.fn();
const save = vi.fn();

vi.mock("../../src/data-source.js", () => {
  const getRepository = () => ({ findOneBy, save });
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(),
  resolveCatalogValueId: vi.fn(),
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
  approveMascota,
  finalizeMascota,
  rejectMascota,
} from "../../src/controllers/mascotas.controller.js";

beforeEach(() => {
  findOneBy.mockReset();
  save.mockReset();
});

describe("approveMascota", () => {
  it("setea reportStatusId a 'activo' y guarda", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);

    const req: any = { params: { id: pet.id } };
    const res = mockRes();
    await approveMascota(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: pet.id,
        reportStatusId: CatalogIds.petReportStatus.activo,
      }),
    );
    expect(res.json).toHaveBeenCalled();
  });

  it("devuelve 404 si la mascota no existe", async () => {
    findOneBy.mockResolvedValue(null);
    const res = mockRes();
    await approveMascota({ params: { id: "x" } } as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Pet no encontrada" });
    expect(save).not.toHaveBeenCalled();
  });
});

describe("finalizeMascota", () => {
  it("rechaza la finalización manual con 409 (se finaliza sola al adoptar)", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.activo });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);

    const res = mockRes();
    await finalizeMascota({ params: { id: pet.id } } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("rejectMascota", () => {
  it("setea reportStatusId a 'rechazado' y guarda", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);

    const res = mockRes();
    await rejectMascota({ params: { id: pet.id } } as any, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.rechazado,
      }),
    );
  });

  it("devuelve 404 si no existe", async () => {
    findOneBy.mockResolvedValue(null);
    const res = mockRes();
    await rejectMascota({ params: { id: "x" } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("permite rechazar incluso un reporte ya activo", async () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.activo });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);

    const res = mockRes();
    await rejectMascota({ params: { id: pet.id } } as any, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.rechazado,
      }),
    );
  });
});
