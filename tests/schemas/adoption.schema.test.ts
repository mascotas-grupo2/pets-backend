import { describe, it, expect } from "vitest";
import { adoptionSchema } from "../../src/schemas/adoption.schema.js";

function validAdoption(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Juan",
    lastName: "Perez",
    email: "juan@example.com",
    phone: "1112345678",
    addressLine1: "Av. Siempreviva 742",
    postcode: "1414",
    town: "CABA",
    adults: 2,
    children: 1,
    acceptsTerms: true,
    ...overrides,
  };
}

describe("adoptionSchema", () => {
  it("acepta un payload minimo valido", () => {
    const r = adoptionSchema.safeParse(validAdoption());
    expect(r.success).toBe(true);
  });

  it("aplica defaults a campos opcionales de texto", () => {
    const r = adoptionSchema.safeParse(validAdoption());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.addressLine2).toBe("");
      expect(r.data.allergies).toBe("");
      expect(r.data.otherAnimalsDetail).toBe("");
      expect(r.data.experience).toBe("");
    }
  });

  it("rechaza email invalido", () => {
    const r = adoptionSchema.safeParse(validAdoption({ email: "no-es-email" }));
    expect(r.success).toBe(false);
  });

  it("rechaza si falta acceptsTerms", () => {
    const r = adoptionSchema.safeParse(validAdoption({ acceptsTerms: undefined }));
    expect(r.success).toBe(false);
  });

  it("rechaza si falta firstName", () => {
    const r = adoptionSchema.safeParse(validAdoption({ firstName: "" }));
    expect(r.success).toBe(false);
  });

  it("rechaza adults negativo", () => {
    const r = adoptionSchema.safeParse(validAdoption({ adults: -1 }));
    expect(r.success).toBe(false);
  });

  it("rechaza children no entero", () => {
    const r = adoptionSchema.safeParse(validAdoption({ children: 1.5 }));
    expect(r.success).toBe(false);
  });

  it("acepta hasGarden como code string", () => {
    const r = adoptionSchema.safeParse(validAdoption({ hasGarden: "si" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasGarden).toBe("si");
  });

  it("acepta hasGardenId numerico", () => {
    const r = adoptionSchema.safeParse(validAdoption({ hasGardenId: 701 }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasGardenId).toBe(701);
  });

  it("coerce hasGardenId desde string numerico", () => {
    const r = adoptionSchema.safeParse(validAdoption({ hasGardenId: "702" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasGardenId).toBe(702);
  });

  it("string vacio en catalogReference se convierte en undefined", () => {
    const r = adoptionSchema.safeParse(validAdoption({ hasGarden: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasGarden).toBeUndefined();
  });

  it("null en optionalPositiveInt se convierte en undefined", () => {
    const r = adoptionSchema.safeParse(validAdoption({ livingSituationId: null }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.livingSituationId).toBeUndefined();
  });

  it("rechaza petId con uuid invalido", () => {
    const r = adoptionSchema.safeParse(validAdoption({ petId: "not-a-uuid" }));
    expect(r.success).toBe(false);
  });

  it("acepta petId con uuid valido", () => {
    const r = adoptionSchema.safeParse(
      validAdoption({ petId: "550e8400-e29b-41d4-a716-446655440000" }),
    );
    expect(r.success).toBe(true);
  });

  it("petId string vacio se convierte en undefined", () => {
    const r = adoptionSchema.safeParse(validAdoption({ petId: "" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.petId).toBeUndefined();
  });

  it("rechaza catalogReference solo con espacios", () => {
    const r = adoptionSchema.safeParse(validAdoption({ hasGarden: "   " }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasGarden).toBeUndefined();
  });

  it("rechaza firstName con mas de 120 caracteres", () => {
    const r = adoptionSchema.safeParse(validAdoption({ firstName: "a".repeat(121) }));
    expect(r.success).toBe(false);
  });

  it("rechaza email con mas de 200 caracteres", () => {
    const email = `${"a".repeat(195)}@b.com`;
    const r = adoptionSchema.safeParse(validAdoption({ email }));
    expect(r.success).toBe(false);
  });
});
