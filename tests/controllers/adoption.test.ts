import { describe, it, expect, vi, beforeEach } from "vitest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { mockRes, mockReq, authReq } from "../helpers/express.js";
import { makeAdoption, makePet, makeUser } from "../factories.js";

const adoptionRepoMock = {
  findOneBy: vi.fn(),
  save: vi.fn(),
  create: vi.fn((x: any) => x),
  find: vi.fn(),
};
const userRepoMock = { findOneBy: vi.fn() };
const petRepoMock = { findOneBy: vi.fn() };

vi.mock("../../src/data-source.js", () => ({
  AppDataSource: {
    getRepository: (entity: any) => {
      const name = entity?.name;
      if (name === "User") return userRepoMock;
      if (name === "Pet") return petRepoMock;
      return adoptionRepoMock;
    },
  },
}));

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(),
  resolveCatalogValueId: vi.fn(async (_catalog: string, input: any) => {
    if (input?.id) return input.id;
    if (input?.code) return 1;
    return null;
  }),
  CatalogValidationError: class CatalogValidationError extends Error {},
}));

vi.mock("../../src/lib/matching.js", () => ({
  calculateCompatibility: vi.fn(() => ({ factors: [] })),
}));

import {
  createAdoption,
  getAdoptionById,
  listAdoptions,
} from "../../src/controllers/adoption.controller.js";
import * as catalogValues from "../../src/lib/catalog-values.js";

function validAdoptionBody(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Juan",
    lastName: "Perez",
    email: "juan@example.com",
    phone: "1112345678",
    addressLine1: "Av. Siempreviva 742",
    postcode: "1414",
    town: "CABA",
    hasGardenId: CatalogIds.yesNo.si,
    livingSituationId: CatalogIds.livingSituation.casa,
    householdSettingId: CatalogIds.householdSetting.urbano,
    activityLevelId: CatalogIds.activityLevel.moderado,
    adults: 2,
    children: 1,
    visitingChildrenId: CatalogIds.yesNo.no,
    hasFlatmatesId: CatalogIds.yesNo.no,
    otherAnimalsId: CatalogIds.yesNo.no,
    neuteredId: CatalogIds.yesNoNA.na,
    vaccinatedId: CatalogIds.yesNoNA.si,
    acceptsTerms: true,
    ...overrides,
  };
}

beforeEach(() => {
  adoptionRepoMock.findOneBy.mockReset();
  adoptionRepoMock.save.mockReset();
  adoptionRepoMock.create.mockReset().mockImplementation((x: any) => x);
  adoptionRepoMock.find.mockReset();
  userRepoMock.findOneBy.mockReset();
  petRepoMock.findOneBy.mockReset();
  vi.mocked(catalogValues.resolveCatalogValueId).mockReset();
  vi.mocked(catalogValues.resolveCatalogValueId).mockImplementation(
    async (_c, input: any) => {
      if (input?.id) return input.id;
      if (input?.code) return 1;
      return null;
    },
  );
  vi.mocked(catalogValues.getCatalogValuesById).mockReset().mockResolvedValue(new Map());
});

describe("createAdoption", () => {
  it("400 si el body no valida", async () => {
    const res = mockRes();
    await createAdoption(authReq({ id: 5 }, { body: { invalid: true } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(adoptionRepoMock.save).not.toHaveBeenCalled();
  });

  it("asigna statusId NUEVA por default", async () => {
    adoptionRepoMock.save.mockImplementation(async (a) => ({ ...a, id: 1 }));
    const res = mockRes();
    await createAdoption(authReq({ id: 5 }, { body: validAdoptionBody() }), res);

    expect(adoptionRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statusId: CatalogIds.adoptionStatus.nueva,
        compatibilityScore: null,
      }),
    );
  });

  it("usa userId del authUser, no del body (anti-spoofing)", async () => {
    adoptionRepoMock.save.mockImplementation(async (a) => ({ ...a, id: 1 }));
    const res = mockRes();
    await createAdoption(
      authReq({ id: 5 }, { body: validAdoptionBody({ userId: 999 }) }),
      res,
    );

    expect(adoptionRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5 }),
    );
  });

  it("permite userId del body si no hay authUser", async () => {
    adoptionRepoMock.save.mockImplementation(async (a) => ({ ...a, id: 1 }));
    const res = mockRes();
    await createAdoption(
      mockReq({ body: validAdoptionBody({ userId: 999 }) }),
      res,
    );

    expect(adoptionRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 999 }),
    );
  });

  it("devuelve 201 con la solicitud creada", async () => {
    adoptionRepoMock.save.mockImplementation(async (a) => ({ ...a, id: 42 }));
    const res = mockRes();
    await createAdoption(authReq({ id: 5 }, { body: validAdoptionBody() }), res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("CatalogValidationError -> 400", async () => {
    vi.mocked(catalogValues.resolveCatalogValueId).mockRejectedValueOnce(
      new catalogValues.CatalogValidationError("hasGarden invalido"),
    );
    const res = mockRes();
    await createAdoption(authReq({ id: 5 }, { body: validAdoptionBody() }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(adoptionRepoMock.save).not.toHaveBeenCalled();
  });

  it("resuelve los IDs de catalogo desde el body", async () => {
    adoptionRepoMock.save.mockImplementation(async (a) => ({ ...a, id: 1 }));
    const res = mockRes();
    await createAdoption(
      authReq({ id: 5 }, { body: validAdoptionBody() }),
      res,
    );

    const savedArg = adoptionRepoMock.save.mock.calls[0][0];
    expect(savedArg.hasGardenId).toBe(CatalogIds.yesNo.si);
    expect(savedArg.livingSituationId).toBe(CatalogIds.livingSituation.casa);
    expect(savedArg.neuteredId).toBe(CatalogIds.yesNoNA.na);
  });
});

describe("getAdoptionById", () => {
  it("400 si el id no es un numero", async () => {
    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 5 }, { params: { id: "abc" } as any }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 si no existe", async () => {
    adoptionRepoMock.findOneBy.mockResolvedValue(null);
    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 5 }, { params: { id: "1" } as any }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("403 si el usuario no es admin ni dueno", async () => {
    const adoption = makeAdoption({ userId: 5 });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);

    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 99 }, { params: { id: "1" } as any }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "No autorizado" });
  });

  it("403 si el usuario no esta autenticado", async () => {
    const adoption = makeAdoption({ userId: 5 });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);

    const res = mockRes();
    await getAdoptionById(mockReq({ params: { id: "1" } as any }), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("permite al dueno ver su propia solicitud", async () => {
    const adoption = makeAdoption({ id: 1, userId: 5 });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);
    userRepoMock.findOneBy.mockResolvedValue(makeUser({ id: 5 }));

    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 5 }, { params: { id: "1" } as any }),
      res,
    );

    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("permite al admin ver solicitudes ajenas", async () => {
    const adoption = makeAdoption({ id: 1, userId: 5 });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);
    userRepoMock.findOneBy.mockResolvedValue(makeUser({ id: 5 }));

    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 99, role: "admin" }, { params: { id: "1" } as any }),
      res,
    );

    expect(res.json).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("incluye applicant, user y pet en la respuesta", async () => {
    const adoption = makeAdoption({
      id: 1,
      userId: 5,
      petId: "pet-abc",
      firstName: "Ana",
      lastName: "Lopez",
      email: "ana@example.com",
      phone: "555-1234",
    });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);
    userRepoMock.findOneBy.mockResolvedValue(makeUser({ id: 5, name: "Ana Lopez" }));
    petRepoMock.findOneBy.mockResolvedValue(makePet({ id: "pet-abc", name: "Firulais" }));

    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 5 }, { params: { id: "1" } as any }),
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.applicant).toEqual({
      firstName: "Ana",
      lastName: "Lopez",
      email: "ana@example.com",
      phone: "555-1234",
    });
    expect(body.user).toMatchObject({ id: 5, name: "Ana Lopez" });
    expect(body.pet).toMatchObject({ id: "pet-abc", name: "Firulais" });
    expect(body.messages).toEqual([]);
  });

  it("pet=null cuando petId es null", async () => {
    const adoption = makeAdoption({ id: 1, userId: 5, petId: null });
    adoptionRepoMock.findOneBy.mockResolvedValue(adoption);
    userRepoMock.findOneBy.mockResolvedValue(makeUser({ id: 5 }));

    const res = mockRes();
    await getAdoptionById(
      authReq({ id: 5 }, { params: { id: "1" } as any }),
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body.pet).toBeNull();
    expect(petRepoMock.findOneBy).not.toHaveBeenCalled();
  });
});

describe("listAdoptions", () => {
  it("401 si no esta autenticado", async () => {
    const res = mockRes();
    await listAdoptions(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("admin recibe TODAS las solicitudes", async () => {
    const items = [
      makeAdoption({ id: 1, userId: 5 }),
      makeAdoption({ id: 2, userId: 7 }),
      makeAdoption({ id: 3, userId: 11 }),
    ];
    adoptionRepoMock.find.mockResolvedValue(items);

    const res = mockRes();
    await listAdoptions(authReq({ id: 1, role: "admin" }), res);

    const call = adoptionRepoMock.find.mock.calls[0][0];
    expect(call.where).toBeUndefined();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveLength(3);
  });

  it("usuario no-admin recibe SOLO sus solicitudes", async () => {
    const items = [makeAdoption({ id: 1, userId: 5 })];
    adoptionRepoMock.find.mockResolvedValue(items);

    const res = mockRes();
    await listAdoptions(authReq({ id: 5 }), res);

    const call = adoptionRepoMock.find.mock.calls[0][0];
    expect(call.where).toEqual({ userId: 5 });
  });
});
