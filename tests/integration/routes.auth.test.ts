import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import { makePet, makeUser, makeAdoption } from "../factories.js";

const petRepoMock = {
  find: vi.fn(),
  findOneBy: vi.fn(),
  findOneByOrFail: vi.fn(),
  findBy: vi.fn(),
  findAndCount: vi.fn(),
  save: vi.fn(),
  create: vi.fn((x: any) => x),
  createQueryBuilder: vi.fn(),
};
const userRepoMock = {
  findOneBy: vi.fn(),
  findAndCount: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
};
const noteRepoMock = {
  find: vi.fn(),
  createQueryBuilder: vi.fn(() => ({
    select: () => ({
      addSelect: () => ({
        addSelect: () => ({
          addSelect: () => ({
            where: () => ({
              groupBy: () => ({
                addGroupBy: () => ({
                  getRawMany: async () => [],
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  })),
};
const adoptionRepoMock = {
  find: vi.fn(),
  findOneBy: vi.fn(),
  save: vi.fn(),
  create: vi.fn((x: any) => x),
  createQueryBuilder: vi.fn(),
};

vi.mock("../../src/data-source.js", () => ({
  AppDataSource: {
    getRepository: (entity: any) => {
      const name = entity?.name;
      if (name === "User") return userRepoMock;
      if (name === "Pet") return petRepoMock;
      if (name === "PetNote") return noteRepoMock;
      if (name === "Adoption") return adoptionRepoMock;
      return petRepoMock;
    },
  },
}));

vi.mock("../../src/lib/catalog-values.js", () => ({
  getCatalogValuesById: vi.fn(async () => new Map()),
  listCatalogValues: vi.fn(async () => []),
  resolveCatalogValueId: vi.fn(async (_c, input: any) => input?.id ?? null),
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

import { app } from "../../src/app.js";
import { createAccessToken } from "../../src/lib/auth.js";

async function adminToken() {
  return createAccessToken(makeUser({ id: 1, roleId: CatalogIds.userRole.admin }));
}

async function userToken(id = 5) {
  return createAccessToken(makeUser({ id, roleId: CatalogIds.userRole.user }));
}

beforeEach(() => {
  petRepoMock.find.mockReset();
  petRepoMock.findOneBy.mockReset();
  petRepoMock.findOneByOrFail.mockReset();
  petRepoMock.findBy.mockReset();
  petRepoMock.findAndCount.mockReset();
  petRepoMock.save.mockReset();
  petRepoMock.create.mockReset().mockImplementation((x: any) => x);
  userRepoMock.findOneBy.mockReset();
  userRepoMock.findAndCount.mockReset();
  userRepoMock.count.mockReset();
  userRepoMock.save.mockReset();
  adoptionRepoMock.find.mockReset();
  adoptionRepoMock.findOneBy.mockReset();
  adoptionRepoMock.save.mockReset();
});

describe("GET /health", () => {
  it("responde 200", async () => {
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/mascotas (publico)", () => {
  it("200 sin token", async () => {
    petRepoMock.find.mockResolvedValue([makePet()]);
    const r = await request(app).get("/api/mascotas");
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
  });

  it("acepta token opcional (optionalAuth)", async () => {
    petRepoMock.find.mockResolvedValue([]);
    const token = await userToken();
    const r = await request(app)
      .get("/api/mascotas")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
  });
});

describe("GET /api/mascotas/admin/list (requireAdmin)", () => {
  it("401 sin token", async () => {
    const r = await request(app).get("/api/mascotas/admin/list");
    expect(r.status).toBe(401);
  });

  it("403 con token de user comun", async () => {
    const token = await userToken();
    const r = await request(app)
      .get("/api/mascotas/admin/list")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(403);
  });

  it("200 con token de admin", async () => {
    petRepoMock.find.mockResolvedValue([]);
    const token = await adminToken();
    const r = await request(app)
      .get("/api/mascotas/admin/list")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
  });
});

describe("POST /api/mascotas/:id/approve (requireAdmin)", () => {
  it("401 sin token", async () => {
    const r = await request(app).post("/api/mascotas/abc/approve");
    expect(r.status).toBe(401);
  });

  it("403 con user comun", async () => {
    const token = await userToken();
    const r = await request(app)
      .post("/api/mascotas/abc/approve")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(403);
  });

  it("admin: aprueba y devuelve 200", async () => {
    const pet = makePet({
      id: "p-1",
      reportStatusId: CatalogIds.petReportStatus.pendiente,
    });
    petRepoMock.findOneBy.mockResolvedValue(pet);
    petRepoMock.save.mockImplementation(async (p: any) => p);
    const token = await adminToken();

    const r = await request(app)
      .post(`/api/mascotas/${pet.id}/approve`)
      .set("Authorization", `Bearer ${token}`);

    expect(r.status).toBe(200);
    expect(petRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reportStatusId: CatalogIds.petReportStatus.activo,
      }),
    );
  });
});

describe("PUT /api/mascotas/:id (requireAuth + ownership)", () => {
  it("401 sin token", async () => {
    const r = await request(app).put("/api/mascotas/abc").send({ name: "x" });
    expect(r.status).toBe(401);
  });

  it("403 usuario que NO es dueno", async () => {
    const pet = makePet({ id: "p-1", userId: 5 });
    petRepoMock.findOneBy.mockResolvedValue(pet);
    const token = await userToken(99);

    const r = await request(app)
      .put(`/api/mascotas/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Hack" });

    expect(r.status).toBe(403);
  });

  it("dueno: 200", async () => {
    const pet = makePet({ id: "p-1", userId: 5 });
    petRepoMock.findOneBy.mockResolvedValue(pet);
    petRepoMock.findOneByOrFail.mockResolvedValue(pet);
    petRepoMock.save.mockImplementation(async (p: any) => p);
    const token = await userToken(5);

    const r = await request(app)
      .put(`/api/mascotas/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Editado" });

    expect(r.status).toBe(200);
  });

  it("admin edita mascota ajena: 200", async () => {
    const pet = makePet({ id: "p-1", userId: 5 });
    petRepoMock.findOneBy.mockResolvedValue(pet);
    petRepoMock.findOneByOrFail.mockResolvedValue(pet);
    petRepoMock.save.mockImplementation(async (p: any) => p);
    const token = await adminToken();

    const r = await request(app)
      .put(`/api/mascotas/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Editado por admin" });

    expect(r.status).toBe(200);
  });
});

describe("GET /api/adoptions/:id (requireAuth + ownership)", () => {
  it("401 sin token", async () => {
    const r = await request(app).get("/api/adoptions/1");
    expect(r.status).toBe(401);
  });

  it("403 si no es admin ni dueno", async () => {
    adoptionRepoMock.findOneBy.mockResolvedValue(makeAdoption({ id: 1, userId: 5 }));
    const token = await userToken(99);
    const r = await request(app)
      .get("/api/adoptions/1")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(403);
  });

  it("dueno: 200", async () => {
    adoptionRepoMock.findOneBy.mockResolvedValue(makeAdoption({ id: 1, userId: 5 }));
    userRepoMock.findOneBy.mockResolvedValue(makeUser({ id: 5 }));
    const token = await userToken(5);
    const r = await request(app)
      .get("/api/adoptions/1")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
  });
});

describe("GET /api/adoptions/admin/paged (requireAdmin)", () => {
  it("401 sin token", async () => {
    const r = await request(app).get("/api/adoptions/admin/paged");
    expect(r.status).toBe(401);
  });

  it("403 con user comun", async () => {
    const token = await userToken();
    const r = await request(app)
      .get("/api/adoptions/admin/paged")
      .set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(403);
  });
});

describe("rutas con token corrupto", () => {
  it("401 con Bearer garbage", async () => {
    const r = await request(app)
      .get("/api/mascotas/admin/list")
      .set("Authorization", "Bearer not-a-jwt");
    expect(r.status).toBe(401);
  });

  it("401 con esquema no-Bearer", async () => {
    const r = await request(app)
      .get("/api/mascotas/admin/list")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(r.status).toBe(401);
  });
});
