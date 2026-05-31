import { describe, it, expect } from "vitest";
import { canViewPet } from "../../src/lib/pet-visibility.js";
import { CatalogIds } from "../../src/lib/catalog-constants.js";
import type { Pet } from "../../src/entity/Pet.js";

function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: "abc-123",
    userId: 5,
    reportStatusId: CatalogIds.petReportStatus.activo,
    statusId: CatalogIds.petStatus.perdido,
    animalTypeId: CatalogIds.animalType.perro,
    medicalStatusId: CatalogIds.petMedicalStatus.sano,
    ...overrides,
  } as Pet;
}

describe("canViewPet", () => {
  it("permite ver reportes activos a usuarios anonimos", () => {
    const pet = makePet();
    expect(canViewPet(pet)).toBe(true);
  });

  it("permite ver reportes activos a cualquier usuario logueado", () => {
    const pet = makePet();
    expect(canViewPet(pet, { id: 99 })).toBe(true);
  });

  it("oculta reportes pendientes a usuarios anonimos", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente });
    expect(canViewPet(pet)).toBe(false);
  });

  it("oculta reportes pendientes a usuarios distintos del dueno", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente, userId: 5 });
    expect(canViewPet(pet, { id: 99 })).toBe(false);
  });

  it("permite al dueno ver sus propios reportes pendientes", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente, userId: 5 });
    expect(canViewPet(pet, { id: 5 })).toBe(true);
  });

  it("permite al dueno ver sus reportes rechazados", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.rechazado, userId: 5 });
    expect(canViewPet(pet, { id: 5 })).toBe(true);
  });

  it("permite al dueno ver sus reportes finalizados", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.finalizado, userId: 5 });
    expect(canViewPet(pet, { id: 5 })).toBe(true);
  });

  it("permite al admin ver reportes pendientes ajenos", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente, userId: 5 });
    expect(canViewPet(pet, { id: 99, role: "admin" })).toBe(true);
  });

  it("permite al admin ver reportes rechazados ajenos", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.rechazado, userId: 5 });
    expect(canViewPet(pet, { id: 99, role: "admin" })).toBe(true);
  });

  it("usuario con role distinto de admin no tiene privilegios extra", () => {
    const pet = makePet({ reportStatusId: CatalogIds.petReportStatus.pendiente, userId: 5 });
    expect(canViewPet(pet, { id: 99, role: "user" })).toBe(false);
  });
});
