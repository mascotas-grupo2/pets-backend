import { describe, it, expect } from "vitest";
import {
  catalogInfo,
  serializeMascota,
  serializePetNote,
  serializeAdoption,
  type CatalogValueMap,
} from "../../src/lib/serializers.js";
import { CatalogIds, CatalogSeed } from "../../src/lib/catalog-constants.js";
import type { CatalogValue } from "../../src/entity/CatalogValue.js";
import type { Pet } from "../../src/entity/Pet.js";
import type { PetNote } from "../../src/entity/PetNote.js";
import type { Adoption } from "../../src/entity/Adoption.js";

function buildCatalogMap(): CatalogValueMap {
  const map = new Map<number, CatalogValue>();
  for (const item of CatalogSeed) {
    map.set(item.id, {
      id: item.id,
      catalog: item.catalog,
      code: item.code,
      label: item.label,
    } as CatalogValue);
  }
  return map;
}

const catalogMap = buildCatalogMap();

describe("catalogInfo", () => {
  it("devuelve id/code/label para un id valido", () => {
    const r = catalogInfo(catalogMap, CatalogIds.animalType.perro);
    expect(r).toEqual({ id: 1, code: "perro", label: "Perro" });
  });

  it("devuelve null para id null", () => {
    expect(catalogInfo(catalogMap, null)).toBeNull();
  });

  it("devuelve null para id undefined", () => {
    expect(catalogInfo(catalogMap, undefined)).toBeNull();
  });

  it("devuelve null para id no encontrado", () => {
    expect(catalogInfo(catalogMap, 99999)).toBeNull();
  });
});

describe("serializeMascota", () => {
  function makePet(overrides: Partial<Pet> = {}): Pet {
    return {
      id: "abc-123",
      userId: 5,
      animalTypeId: CatalogIds.animalType.perro,
      sexId: CatalogIds.petSex.macho,
      statusId: CatalogIds.petStatus.perdido,
      reportStatusId: CatalogIds.petReportStatus.activo,
      medicalStatusId: CatalogIds.petMedicalStatus.sano,
      ...overrides,
    } as Pet;
  }

  it("expande animalType a code, label e info", () => {
    const r = serializeMascota(makePet(), catalogMap);
    expect(r.animalType).toBe("perro");
    expect(r.animalTypeLabel).toBe("Perro");
    expect(r.animalTypeInfo).toEqual({ id: 1, code: "perro", label: "Perro" });
  });

  it("expande todos los campos de catalogo", () => {
    const r = serializeMascota(makePet(), catalogMap);
    expect(r.sex).toBe("macho");
    expect(r.status).toBe("perdido");
    expect(r.reportStatus).toBe("activo");
    expect(r.medicalStatus).toBe("sano");
  });

  it("preserva campos no-catalogo", () => {
    const pet = makePet({ id: "xyz", userId: 42 });
    const r = serializeMascota(pet, catalogMap);
    expect(r.id).toBe("xyz");
    expect(r.userId).toBe(42);
  });

  it("devuelve null para ids ausentes", () => {
    const pet = makePet({ sexId: null });
    const r = serializeMascota(pet, catalogMap);
    expect(r.sex).toBeNull();
    expect(r.sexLabel).toBeNull();
    expect(r.sexInfo).toBeNull();
  });
});

describe("serializePetNote", () => {
  function makeNote(overrides: Partial<PetNote> = {}): PetNote {
    return {
      id: 1,
      petId: "abc-123",
      kindId: CatalogIds.petNoteKind.general,
      text: "Una nota",
      createdAt: new Date("2026-01-01"),
      ...overrides,
    } as PetNote;
  }

  it("expande kind a code, label e info", () => {
    const r = serializePetNote(makeNote(), catalogMap);
    expect(r.kind).toBe("general");
    expect(r.kindLabel).toBe("General");
    expect(r.kindInfo).toEqual({ id: 401, code: "general", label: "General" });
  });

  it("preserva campos originales", () => {
    const note = makeNote({ text: "Vacuna aplicada" });
    const r = serializePetNote(note, catalogMap);
    expect(r.text).toBe("Vacuna aplicada");
    expect(r.petId).toBe("abc-123");
  });

  it("devuelve null si kindId es null", () => {
    const r = serializePetNote(makeNote({ kindId: null as any }), catalogMap);
    expect(r.kind).toBeNull();
  });
});

describe("serializeAdoption", () => {
  function makeAdoption(overrides: Partial<Adoption> = {}): Adoption {
    return {
      id: 1,
      userId: 5,
      petId: null,
      statusId: CatalogIds.adoptionStatus.nueva,
      compatibilityScore: null,
      preferredAnimalTypeId: CatalogIds.animalType.gato,
      hasGardenId: CatalogIds.yesNo.si,
      livingSituationId: CatalogIds.livingSituation.casa,
      householdSettingId: CatalogIds.householdSetting.urbano,
      activityLevelId: CatalogIds.activityLevel.activo,
      visitingChildrenId: CatalogIds.yesNo.no,
      hasFlatmatesId: CatalogIds.yesNo.no,
      otherAnimalsId: CatalogIds.yesNo.si,
      neuteredId: CatalogIds.yesNoNA.na,
      vaccinatedId: CatalogIds.yesNoNA.si,
      firstName: "Juan",
      lastName: "Perez",
      email: "juan@example.com",
      ...overrides,
    } as Adoption;
  }

  it("expande status (default NUEVA si no encontrado)", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.status).toBe("NUEVA");
    expect(r.statusLabel).toBe("Nueva");
  });

  it("status fallback es NUEVA cuando statusId no esta en el catalogo", () => {
    const r = serializeAdoption(makeAdoption({ statusId: 9999 as any }), catalogMap);
    expect(r.status).toBe("NUEVA");
    expect(r.statusLabel).toBe("Nueva");
  });

  it("expande preferredAnimal correctamente", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.preferredAnimal).toBe("gato");
    expect(r.preferredAnimalLabel).toBe("Gato");
  });

  it("expande todos los campos yes/no", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.hasGarden).toBe("si");
    expect(r.visitingChildren).toBe("no");
    expect(r.hasFlatmates).toBe("no");
    expect(r.otherAnimals).toBe("si");
  });

  it("expande neutered/vaccinated del catalogo yes_no_na", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.neutered).toBe("na");
    expect(r.vaccinated).toBe("si");
  });

  it("compatibilityScore null se preserva", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.compatibilityScore).toBeNull();
  });

  it("compatibilityScore numerico se preserva", () => {
    const r = serializeAdoption(makeAdoption({ compatibilityScore: 85 }), catalogMap);
    expect(r.compatibilityScore).toBe(85);
  });

  it("preserva firstName, lastName, email", () => {
    const r = serializeAdoption(makeAdoption(), catalogMap);
    expect(r.firstName).toBe("Juan");
    expect(r.email).toBe("juan@example.com");
  });
});
