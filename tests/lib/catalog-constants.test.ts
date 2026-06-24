import { describe, it, expect } from "vitest";
import {
  Catalog,
  CatalogIds,
  CatalogSeed,
  catalogCodeForId,
  catalogItemForId,
  catalogIdForCode,
} from "../../src/lib/catalog-constants.js";

describe("CatalogSeed integridad", () => {
  it("todos los ids son unicos", () => {
    const ids = CatalogSeed.map((item) => item.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("(catalog, code) son unicos", () => {
    const keys = CatalogSeed.map((item) => `${item.catalog}:${item.code}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("todos los catalog values referencian un nombre de catalogo conocido", () => {
    const knownCatalogs = new Set(Object.values(Catalog));
    for (const item of CatalogSeed) {
      expect(knownCatalogs.has(item.catalog)).toBe(true);
    }
  });

  it("todos los ids de CatalogIds existen en CatalogSeed", () => {
    const seedIds = new Set(CatalogSeed.map((item) => item.id));
    for (const group of Object.values(CatalogIds)) {
      for (const id of Object.values(group)) {
        expect(seedIds.has(id)).toBe(true);
      }
    }
  });
});

describe("catalogCodeForId", () => {
  it("devuelve el code para un id existente", () => {
    expect(catalogCodeForId(CatalogIds.animalType.perro)).toBe("perro");
    expect(catalogCodeForId(CatalogIds.userRole.admin)).toBe("admin");
  });

  it("devuelve null para id desconocido", () => {
    expect(catalogCodeForId(99999)).toBeNull();
  });

  it("devuelve null para null/undefined", () => {
    expect(catalogCodeForId(null)).toBeNull();
    expect(catalogCodeForId(undefined)).toBeNull();
  });
});

describe("catalogItemForId", () => {
  it("devuelve el item completo para un id existente", () => {
    const item = catalogItemForId(CatalogIds.animalType.perro);
    expect(item).toMatchObject({ id: 1, code: "perro", label: "Perro" });
  });

  it("devuelve null para id desconocido", () => {
    expect(catalogItemForId(99999)).toBeNull();
  });
});

describe("catalogIdForCode", () => {
  it("devuelve el id para code valido", () => {
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, "perro")).toBe(1);
    expect(catalogIdForCode(Catalog.USER_ROLE, "admin")).toBe(502);
  });

  it("es case-insensitive", () => {
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, "PERRO")).toBe(1);
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, "Perro")).toBe(1);
  });

  it("ignora espacios alrededor del code", () => {
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, "  perro  ")).toBe(1);
  });

  it("devuelve null para code no encontrado en ese catalogo", () => {
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, "inexistente")).toBeNull();
  });

  it("no cruza catalogos: code valido en otro catalogo no matchea", () => {
    expect(catalogIdForCode(Catalog.YES_NO, "perro")).toBeNull();
  });

  it("devuelve null para code null/undefined/vacio", () => {
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, null)).toBeNull();
    expect(catalogIdForCode(Catalog.ANIMAL_TYPE, undefined)).toBeNull();
  });
});
