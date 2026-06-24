import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes, authReq } from "../helpers/express.js";
import { makePet } from "../factories.js";

const findOneBy = vi.fn();
const findOneByOrFail = vi.fn();
const save = vi.fn();

vi.mock("../../src/data-source.js", () => ({
  AppDataSource: {
    getRepository: () => ({ findOneBy, findOneByOrFail, save }),
  },
}));

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
  geocodificarDireccion: vi.fn(async () => null),
}));

import { updateMascota } from "../../src/controllers/mascotas.controller.js";
import { CatalogValidationError } from "../../src/lib/catalog-values.js";
import * as catalogValues from "../../src/lib/catalog-values.js";

beforeEach(() => {
  findOneBy.mockReset();
  findOneByOrFail.mockReset();
  save.mockReset();
  vi.mocked(catalogValues.resolveCatalogValueId).mockReset().mockResolvedValue(null);
  vi.mocked(catalogValues.getCatalogValuesById).mockReset().mockResolvedValue(new Map());
});

describe("updateMascota - validacion", () => {
  it("devuelve 400 si el body no valida", async () => {
    const req = authReq({ id: 5 }, {
      params: { id: "abc-123" } as any,
      body: { contactEmail: "no-es-email" },
    });
    const res = mockRes();
    await updateMascota(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(findOneBy).not.toHaveBeenCalled();
  });

  it("devuelve 404 si la mascota no existe", async () => {
    findOneBy.mockResolvedValue(null);
    const req = authReq({ id: 5 }, {
      params: { id: "abc-123" } as any,
      body: { name: "Nuevo nombre" },
    });
    const res = mockRes();
    await updateMascota(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("updateMascota - autorizacion (ownership)", () => {
  it("usuario no-admin que NO es dueno recibe 403", async () => {
    const pet = makePet({ userId: 5 });
    findOneBy.mockResolvedValue(pet);

    const req = authReq({ id: 99 }, {
      params: { id: pet.id } as any,
      body: { name: "Hack" },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "No autorizado" });
    expect(save).not.toHaveBeenCalled();
  });

  it("usuario anonimo recibe 403", async () => {
    const pet = makePet({ userId: 5 });
    findOneBy.mockResolvedValue(pet);

    const req: any = { params: { id: pet.id }, body: { name: "Hack" } };
    const res = mockRes();
    await updateMascota(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(save).not.toHaveBeenCalled();
  });

  it("usuario no-admin que SI es dueno puede editar", async () => {
    const pet = makePet({ userId: 5 });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);

    const req = authReq({ id: 5 }, {
      params: { id: pet.id } as any,
      body: { name: "Nuevo" },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("admin puede editar cualquier mascota aunque no sea dueno", async () => {
    const pet = makePet({ userId: 5 });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);

    const req = authReq({ id: 99, role: "admin" }, {
      params: { id: pet.id } as any,
      body: { name: "Editado por admin" },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(save).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});

describe("updateMascota - regla de reportStatus", () => {
  it("usuario no-admin: el reporte vuelve a 'pendiente' tras editar", async () => {
    const pet = makePet({
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.activo,
    });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);

    const req = authReq({ id: 5 }, {
      params: { id: pet.id } as any,
      body: { name: "Cambio de descripcion" },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.pendiente,
      }),
    );
  });

  it("usuario no-admin: reportStatus en el body se ignora", async () => {
    const pet = makePet({
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.pendiente,
    });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);

    const req = authReq({ id: 5 }, {
      params: { id: pet.id } as any,
      body: {
        name: "Foo",
        reportStatusId: CatalogIds.petReportStatus.activo,
        reportStatus: "activo",
      },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.pendiente,
      }),
    );
  });

  it("admin: NO fuerza vuelta a 'pendiente'", async () => {
    const pet = makePet({
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.activo,
    });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);

    const req = authReq({ id: 99, role: "admin" }, {
      params: { id: pet.id } as any,
      body: { name: "Editado admin" },
    });
    const res = mockRes();
    await updateMascota(req, res);

    const savedArg = save.mock.calls[0][0];
    expect(savedArg.reportStatusId).not.toBe(CatalogIds.petReportStatus.pendiente);
    expect(savedArg.reportStatusId).toBe(CatalogIds.petReportStatus.activo);
  });

  it("admin: puede cambiar reportStatus via reportStatusId", async () => {
    const pet = makePet({
      userId: 5,
      reportStatusId: CatalogIds.petReportStatus.pendiente,
    });
    findOneBy.mockResolvedValue(pet);
    save.mockImplementation(async (p) => p);
    findOneByOrFail.mockImplementation(async () => pet);
    vi.mocked(catalogValues.resolveCatalogValueId).mockImplementation(
      async (catalog, input) => {
        if (catalog === "pet_report_status" && (input as any).id === CatalogIds.petReportStatus.activo) {
          return CatalogIds.petReportStatus.activo;
        }
        return null;
      },
    );

    const req = authReq({ id: 99, role: "admin" }, {
      params: { id: pet.id } as any,
      body: { reportStatusId: CatalogIds.petReportStatus.activo },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.activo,
      }),
    );
  });
});

describe("updateMascota - errores de catalogo", () => {
  it("CatalogValidationError -> 400", async () => {
    const pet = makePet({ userId: 5 });
    findOneBy.mockResolvedValue(pet);
    vi.mocked(catalogValues.resolveCatalogValueId).mockRejectedValueOnce(
      new CatalogValidationError("animal_type desconocido"),
    );

    const req = authReq({ id: 5 }, {
      params: { id: pet.id } as any,
      body: { animalTypeId: 9999 },
    });
    const res = mockRes();
    await updateMascota(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(save).not.toHaveBeenCalled();
  });
});
