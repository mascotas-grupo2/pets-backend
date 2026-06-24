import { describe, it, expect } from "vitest";
import {
  adoptionStatusEntries,
  adoptionStatusById,
  adoptionStatusByCode,
  isAdoptionStatusId,
  getAdoptionStatusCode,
  parseStatusId,
} from "../../src/lib/adoption-status.js";
import { CatalogIds } from "../../src/lib/catalog-constants.js";

describe("adoptionStatusEntries", () => {
  it("declara los 6 estados del workflow", () => {
    expect(adoptionStatusEntries).toHaveLength(6);
  });

  it("los ids coinciden con CatalogIds.adoptionStatus", () => {
    const ids = adoptionStatusEntries.map((e) => e.id).sort();
    const expected = Object.values(CatalogIds.adoptionStatus).sort();
    expect(ids).toEqual(expected);
  });

  it("los ids estan en el rango 1201-1206", () => {
    for (const entry of adoptionStatusEntries) {
      expect(entry.id).toBeGreaterThanOrEqual(1201);
      expect(entry.id).toBeLessThanOrEqual(1206);
    }
  });
});

describe("adoptionStatusById / adoptionStatusByCode", () => {
  it("son mapeos inversos consistentes", () => {
    for (const entry of adoptionStatusEntries) {
      expect(adoptionStatusById.get(entry.id)).toBe(entry.code);
      expect(adoptionStatusByCode.get(entry.code)).toBe(entry.id);
    }
  });
});

describe("isAdoptionStatusId", () => {
  it("acepta ids del workflow", () => {
    expect(isAdoptionStatusId(CatalogIds.adoptionStatus.nueva)).toBe(true);
    expect(isAdoptionStatusId(CatalogIds.adoptionStatus.aceptada)).toBe(true);
    expect(isAdoptionStatusId(CatalogIds.adoptionStatus.descartada)).toBe(true);
  });

  it("rechaza ids de otros catalogos", () => {
    expect(isAdoptionStatusId(CatalogIds.petStatus.perdido)).toBe(false);
    expect(isAdoptionStatusId(CatalogIds.userRole.admin)).toBe(false);
  });

  it("rechaza ids inexistentes", () => {
    expect(isAdoptionStatusId(9999)).toBe(false);
    expect(isAdoptionStatusId(0)).toBe(false);
  });
});

describe("getAdoptionStatusCode", () => {
  it("devuelve el code para un id valido", () => {
    expect(getAdoptionStatusCode(CatalogIds.adoptionStatus.nueva)).toBe("NUEVA");
    expect(getAdoptionStatusCode(CatalogIds.adoptionStatus.aceptada)).toBe("ACEPTADA");
  });

  it("devuelve undefined para ids fuera del workflow", () => {
    expect(getAdoptionStatusCode(9999)).toBeUndefined();
  });

  it("devuelve undefined para null/undefined", () => {
    expect(getAdoptionStatusCode(null)).toBeUndefined();
    expect(getAdoptionStatusCode(undefined)).toBeUndefined();
  });

  it("devuelve undefined para decimales", () => {
    expect(getAdoptionStatusCode(1201.5)).toBeUndefined();
  });
});

describe("parseStatusId", () => {
  it("prioriza statusId numerico sobre code", () => {
    const r = parseStatusId("DESCARTADA", CatalogIds.adoptionStatus.aceptada);
    expect(r).toBe(CatalogIds.adoptionStatus.aceptada);
  });

  it("acepta statusId desde string numerico", () => {
    const r = parseStatusId(undefined, "1203");
    expect(r).toBe(CatalogIds.adoptionStatus.entrevistaPendiente);
  });

  it("cae a parsear code cuando statusId no es valido", () => {
    const r = parseStatusId("ACEPTADA", undefined);
    expect(r).toBe(CatalogIds.adoptionStatus.aceptada);
  });

  it("cae a parsear code cuando statusId no esta en el workflow", () => {
    const r = parseStatusId("NUEVA", 9999);
    expect(r).toBe(CatalogIds.adoptionStatus.nueva);
  });

  it("normaliza espacios en code", () => {
    const r = parseStatusId("  ENTREVISTA_PENDIENTE  ", undefined);
    expect(r).toBe(CatalogIds.adoptionStatus.entrevistaPendiente);
  });

  it("devuelve undefined para code desconocido", () => {
    expect(parseStatusId("INEXISTENTE", undefined)).toBeUndefined();
  });

  it("devuelve undefined para code vacio", () => {
    expect(parseStatusId("", undefined)).toBeUndefined();
    expect(parseStatusId("   ", undefined)).toBeUndefined();
  });

  it("devuelve undefined sin ningun valor", () => {
    expect(parseStatusId(undefined, undefined)).toBeUndefined();
  });

  it("rechaza code no-string", () => {
    expect(parseStatusId(123, undefined)).toBeUndefined();
  });
});
