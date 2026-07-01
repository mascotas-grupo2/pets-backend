import { describe, it, expect, vi, beforeEach } from "vitest";
import { FindOperator } from "typeorm";

// tenant.ts importa AppDataSource (para getDefaultRefugioId). Lo stubbeamos para
// no arrastrar la conexión real; estos tests solo ejercitan funciones puras.
vi.mock("../../src/data-source.js", () => ({
  AppDataSource: { getRepository: () => ({ findOneBy: vi.fn() }) },
}));

// scopedUserIds usa dbManager(); mockeamos db-context para controlar las queries.
const userFind = vi.fn();
const adoptionGetRawMany = vi.fn();
vi.mock("../../src/lib/db-context.js", () => ({
  RLS_ENABLED: false,
  RLS_APP_ROLE: "pets_app",
  runWithManager: (_m: any, fn: () => void) => fn(),
  dbManager: () => ({
    getRepository: (entity: any) =>
      entity?.name === "User"
        ? { find: userFind }
        : {
            createQueryBuilder: () => ({
              select() {
                return this;
              },
              where() {
                return this;
              },
              andWhere() {
                return this;
              },
              getRawMany: adoptionGetRawMany,
            }),
          },
  }),
}));

import {
  isSuperadmin,
  refugioIdOf,
  tenantScope,
  tenantWhere,
  petVisibilityWhere,
  applyPetVisibility,
  applyTenantScope,
  stampRefugioIfManaged,
  scopedUserIds,
  MANAGED_PET_STATUS,
} from "../../src/lib/tenant.js";
import { CatalogIds } from "../../src/lib/catalog-constants.js";

const superadmin = { id: 1, role: "superadmin" };
const refugioAdmin = { id: 2, role: "admin", refugioId: 7 };

// Fake QueryBuilder encadenable que registra las llamadas a andWhere.
function fakeQb() {
  const calls: Array<{ clause: string; params?: any }> = [];
  const qb: any = {
    andWhere: vi.fn((clause: string, params?: any) => {
      calls.push({ clause, params });
      return qb;
    }),
  };
  return { qb, calls };
}

describe("isSuperadmin", () => {
  it("true solo para role superadmin", () => {
    expect(isSuperadmin(superadmin)).toBe(true);
    expect(isSuperadmin(refugioAdmin)).toBe(false);
    expect(isSuperadmin({ id: 3 })).toBe(false);
    expect(isSuperadmin(null)).toBe(false);
    expect(isSuperadmin(undefined)).toBe(false);
  });
});

describe("refugioIdOf", () => {
  it("devuelve el refugioId o null", () => {
    expect(refugioIdOf(refugioAdmin)).toBe(7);
    expect(refugioIdOf({ id: 3, role: "admin" })).toBeNull();
    expect(refugioIdOf(null)).toBeNull();
  });
});

describe("tenantScope", () => {
  it("superadmin no tiene scope", () => {
    expect(tenantScope(superadmin)).toEqual({ scoped: false, refugioId: null });
  });
  it("admin de refugio queda scopeado a su refugio", () => {
    expect(tenantScope(refugioAdmin)).toEqual({ scoped: true, refugioId: 7 });
  });
  it("usuario sin refugio queda scopeado con refugioId null", () => {
    expect(tenantScope({ id: 3, role: "admin" })).toEqual({
      scoped: true,
      refugioId: null,
    });
  });
  it("sin authUser queda scopeado (deny by default)", () => {
    expect(tenantScope(undefined).scoped).toBe(true);
  });
});

describe("tenantWhere", () => {
  it("superadmin: where vacío (ve todo)", () => {
    expect(tenantWhere(superadmin)).toEqual({});
  });
  it("admin de refugio: filtra por su refugioId", () => {
    expect(tenantWhere(refugioAdmin)).toEqual({ refugioId: 7 });
  });
  it("scopeado sin refugio: refugioId -1 (no matchea nada)", () => {
    expect(tenantWhere({ id: 3, role: "admin" })).toEqual({ refugioId: -1 });
  });
});

describe("petVisibilityWhere", () => {
  it("superadmin: devuelve el where base sin tocar", () => {
    const base = { statusId: 5 };
    expect(petVisibilityWhere(base, superadmin)).toBe(base);
  });

  it("admin de refugio: su refugio O reportes públicos (refugio NULL)", () => {
    const where = petVisibilityWhere({ statusId: 5 }, refugioAdmin);
    expect(Array.isArray(where)).toBe(true);
    const arr = where as any[];
    expect(arr).toHaveLength(2);
    // Rama 1: las de su refugio, conservando el filtro base.
    expect(arr[0]).toMatchObject({ statusId: 5, refugioId: 7 });
    // Rama 2: las públicas (refugioId IS NULL).
    expect(arr[1].statusId).toBe(5);
    expect(arr[1].refugioId).toBeInstanceOf(FindOperator);
  });

  it("scopeado sin refugio: usa -1 para no filtrar de más", () => {
    const arr = petVisibilityWhere({}, { id: 3, role: "admin" }) as any[];
    expect(arr[0].refugioId).toBe(-1);
  });
});

describe("applyPetVisibility (QueryBuilder)", () => {
  it("superadmin: no agrega ninguna condición", () => {
    const { qb, calls } = fakeQb();
    applyPetVisibility(qb, "pet", superadmin);
    expect(calls).toHaveLength(0);
  });

  it("admin de refugio: agrega 'refugio O NULL'", () => {
    const { qb, calls } = fakeQb();
    applyPetVisibility(qb, "pet", refugioAdmin);
    expect(calls).toHaveLength(1);
    expect(calls[0].clause).toContain("pet.refugioId");
    expect(calls[0].clause).toContain("IS NULL");
    expect(calls[0].params).toEqual({ petTenantRefugioId: 7 });
  });
});

describe("applyTenantScope (QueryBuilder)", () => {
  it("superadmin: no agrega condición", () => {
    const { qb, calls } = fakeQb();
    applyTenantScope(qb, "a", superadmin);
    expect(calls).toHaveLength(0);
  });

  it("admin de refugio: filtra estricto por su refugioId (sin públicas)", () => {
    const { qb, calls } = fakeQb();
    applyTenantScope(qb, "a", refugioAdmin);
    expect(calls).toHaveLength(1);
    expect(calls[0].clause).toBe("a.refugioId = :tenantRefugioId");
    expect(calls[0].clause).not.toContain("IS NULL");
    expect(calls[0].params).toEqual({ tenantRefugioId: 7 });
  });
});

describe("stampRefugioIfManaged", () => {
  it("estampa el refugio del admin en una mascota gestionada sin refugio", () => {
    const pet = { refugioId: null, statusId: CatalogIds.petStatus.encontrado };
    stampRefugioIfManaged(pet, refugioAdmin);
    expect(pet.refugioId).toBe(7);
  });

  it("no pisa un refugio ya asignado", () => {
    const pet = { refugioId: 99, statusId: CatalogIds.petStatus.encontrado };
    stampRefugioIfManaged(pet, refugioAdmin);
    expect(pet.refugioId).toBe(99);
  });

  it("no estampa estados no gestionados (perdido es reporte público)", () => {
    const pet = { refugioId: null, statusId: CatalogIds.petStatus.perdido };
    stampRefugioIfManaged(pet, refugioAdmin);
    expect(pet.refugioId).toBeNull();
  });

  it("no estampa si el admin no tiene refugio (p. ej. superadmin)", () => {
    const pet = { refugioId: null, statusId: CatalogIds.petStatus.encontrado };
    stampRefugioIfManaged(pet, superadmin);
    expect(pet.refugioId).toBeNull();
  });
});

describe("MANAGED_PET_STATUS", () => {
  it("incluye los estados de refugio/adopción y excluye 'perdido'", () => {
    expect(MANAGED_PET_STATUS).toContain(CatalogIds.petStatus.encontrado);
    expect(MANAGED_PET_STATUS).toContain(CatalogIds.petStatus.adoptado);
    expect(MANAGED_PET_STATUS).not.toContain(CatalogIds.petStatus.perdido);
  });
});

describe("scopedUserIds", () => {
  beforeEach(() => {
    userFind.mockReset();
    adoptionGetRawMany.mockReset();
  });

  it("superadmin sin scope: null (todos los usuarios), sin tocar la DB", async () => {
    const ids = await scopedUserIds(superadmin);
    expect(ids).toBeNull();
    expect(userFind).not.toHaveBeenCalled();
  });

  it("admin de refugio: unión de staff + adoptantes (sin duplicados)", async () => {
    userFind.mockResolvedValue([{ id: 10 }, { id: 11 }]); // staff
    adoptionGetRawMany.mockResolvedValue([{ userId: 11 }, { userId: 20 }]); // adoptantes
    const ids = await scopedUserIds(refugioAdmin);
    expect(new Set(ids!)).toEqual(new Set([10, 11, 20]));
  });

  it("refugio sin usuarios: [-1] (no matchea a nadie)", async () => {
    userFind.mockResolvedValue([]);
    adoptionGetRawMany.mockResolvedValue([]);
    const ids = await scopedUserIds(refugioAdmin);
    expect(ids).toEqual([-1]);
  });
});
