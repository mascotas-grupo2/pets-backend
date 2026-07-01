import { describe, it, expect, vi, beforeEach } from "vitest";
import { FindOperator } from "typeorm";
import { mockRes, authReq } from "../helpers/express.js";

// QueryBuilder de las notas de reclamo: devuelve una nota para que el handler
// pase por el findBy de mascotas (donde aplica el scope de visibilidad).
const claimNotes = [{ petId: "p1", text: "🔔 RECLAMO de Juan Usuario ID: 50" }];
const noteRepoMock = {
  createQueryBuilder: vi.fn(() => ({
    where() {
      return this;
    },
    orderBy() {
      return this;
    },
    getMany: async () => claimNotes,
  })),
};
const findBy = vi.fn(async () => []); // Pet.findBy
const petRepoMock = { findBy };

vi.mock("../../src/data-source.js", () => {
  const getRepository = (entity: any) => {
    if (entity?.name === "PetNote") return noteRepoMock;
    return petRepoMock;
  };
  return { AppDataSource: { getRepository, manager: { getRepository } } };
});

vi.mock("../../src/lib/minio.js", () => ({
  uploadFileToMinio: vi.fn(),
}));

import { getAdminAlerts } from "../../src/controllers/message.controller.js";

const refugioAdmin = { id: 2, role: "admin", refugioId: 7 };
const superadmin = { id: 1, role: "superadmin" };

beforeEach(() => {
  findBy.mockClear();
  findBy.mockResolvedValue([]);
});

describe("getAdminAlerts - scope multi-tenant", () => {
  it("el admin de refugio solo trae alertas de mascotas visibles", async () => {
    const res = mockRes();
    await getAdminAlerts(authReq(refugioAdmin), res);

    expect(findBy).toHaveBeenCalledTimes(1);
    const where = findBy.mock.calls[0][0];
    // Visibilidad: su refugio O reportes públicos (refugioId NULL).
    expect(Array.isArray(where)).toBe(true);
    expect(where[0].refugioId).toBe(7);
    expect(where[1].refugioId).toBeInstanceOf(FindOperator);
    // El id sigue presente en ambas ramas (filtra a las mascotas reclamadas).
    expect(where[0].id).toBeInstanceOf(FindOperator); // In([...])
    expect(res.json).toHaveBeenCalled();
  });

  it("el superadmin no filtra por refugio", async () => {
    const res = mockRes();
    await getAdminAlerts(authReq(superadmin), res);

    const where = findBy.mock.calls[0][0];
    expect(Array.isArray(where)).toBe(false);
    expect(where.refugioId).toBeUndefined();
    expect(where.id).toBeInstanceOf(FindOperator); // solo In([...])
  });
});
