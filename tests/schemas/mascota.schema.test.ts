import { describe, it, expect } from "vitest";
import {
  petCreateSchema,
  petUpdateSchema,
  petNoteCreateSchema,
} from "../../src/schemas/mascota.schema.js";

function validPet(overrides: Record<string, unknown> = {}) {
  return {
    description: "Perro mediano marron",
    animalTypeId: 1,
    date: "2026-01-10",
    location: "Palermo, CABA",
    contactPhone: "1112345678",
    contactEmail: "owner@example.com",
    ...overrides,
  };
}

describe("petCreateSchema", () => {
  it("acepta un payload minimo valido", () => {
    const r = petCreateSchema.safeParse(validPet());
    expect(r.success).toBe(true);
  });

  it("coerce animalTypeId desde string numerico", () => {
    const r = petCreateSchema.safeParse(validPet({ animalTypeId: "2" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.animalTypeId).toBe(2);
  });

  it("acepta animalType como code string sin animalTypeId", () => {
    const r = petCreateSchema.safeParse(validPet({ animalTypeId: undefined, animalType: "perro" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.animalType).toBe("perro");
  });

  it("acepta animalType como number id", () => {
    const r = petCreateSchema.safeParse(validPet({ animalTypeId: undefined, animalType: 1 }));
    expect(r.success).toBe(true);
  });

  it("rechaza si falta animalType y animalTypeId", () => {
    const r = petCreateSchema.safeParse(validPet({ animalTypeId: undefined, animalType: undefined }));
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "animalTypeId");
      expect(issue?.message).toBe("Requerido");
    }
  });

  it("convierte string vacio a undefined en animalTypeId", () => {
    const r = petCreateSchema.safeParse(validPet({ animalTypeId: "", animalType: "perro" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.animalTypeId).toBeUndefined();
  });

  it("convierte null a undefined en sexId", () => {
    const r = petCreateSchema.safeParse(validPet({ sexId: null }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sexId).toBeUndefined();
  });

  it("rechaza sexId no positivo", () => {
    const r = petCreateSchema.safeParse(validPet({ sexId: 0 }));
    expect(r.success).toBe(false);
  });

  it("rechaza sexId con coma decimal", () => {
    const r = petCreateSchema.safeParse(validPet({ sexId: 1.5 }));
    expect(r.success).toBe(false);
  });

  it("rechaza contactEmail invalido", () => {
    const r = petCreateSchema.safeParse(validPet({ contactEmail: "no-es-email" }));
    expect(r.success).toBe(false);
  });

  it("rechaza description vacia", () => {
    const r = petCreateSchema.safeParse(validPet({ description: "" }));
    expect(r.success).toBe(false);
  });

  it("rechaza name de mas de 120 caracteres", () => {
    const r = petCreateSchema.safeParse(validPet({ name: "a".repeat(121) }));
    expect(r.success).toBe(false);
  });

  it("rechaza catalog reference string solo con espacios", () => {
    const r = petCreateSchema.safeParse(
      validPet({ animalTypeId: undefined, animalType: "   " }),
    );
    expect(r.success).toBe(false);
  });

  it("acepta photos como array de urls", () => {
    const r = petCreateSchema.safeParse(
      validPet({ photos: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"] }),
    );
    expect(r.success).toBe(true);
  });

  it("rechaza photos con string que no es url", () => {
    const r = petCreateSchema.safeParse(validPet({ photos: ["no-url"] }));
    expect(r.success).toBe(false);
  });

  it("rechaza ageMonths negativo", () => {
    const r = petCreateSchema.safeParse(validPet({ ageMonths: -1 }));
    expect(r.success).toBe(false);
  });
});

describe("petUpdateSchema", () => {
  it("acepta objeto vacio (todos los campos opcionales)", () => {
    const r = petUpdateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("acepta actualizar solo un campo", () => {
    const r = petUpdateSchema.safeParse({ description: "nueva desc" });
    expect(r.success).toBe(true);
  });

  it("no requiere animalType ni animalTypeId", () => {
    const r = petUpdateSchema.safeParse({ name: "Toby" });
    expect(r.success).toBe(true);
  });

  it("sigue validando tipos en campos que se envian", () => {
    const r = petUpdateSchema.safeParse({ contactEmail: "no-es-email" });
    expect(r.success).toBe(false);
  });
});

describe("petNoteCreateSchema", () => {
  it("acepta nota minima con text", () => {
    const r = petNoteCreateSchema.safeParse({ text: "Nota de seguimiento" });
    expect(r.success).toBe(true);
  });

  it("acepta kindId numerico", () => {
    const r = petNoteCreateSchema.safeParse({ text: "x", kindId: 402 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.kindId).toBe(402);
  });

  it("acepta kind como code string", () => {
    const r = petNoteCreateSchema.safeParse({ text: "x", kind: "medica" });
    expect(r.success).toBe(true);
  });

  it("rechaza text vacio", () => {
    const r = petNoteCreateSchema.safeParse({ text: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza text de mas de 2000 caracteres", () => {
    const r = petNoteCreateSchema.safeParse({ text: "a".repeat(2001) });
    expect(r.success).toBe(false);
  });
});
