import { describe, it, expect } from "vitest";
import {
  parseOptionalInt,
  parseOptionalNumber,
  parsePagination,
} from "../../src/lib/query-utils.js";

describe("parseOptionalInt", () => {
  it("acepta entero positivo", () => {
    expect(parseOptionalInt(5)).toBe(5);
  });

  it("coerce string numerico", () => {
    expect(parseOptionalInt("42")).toBe(42);
  });

  it("rechaza cero", () => {
    expect(parseOptionalInt(0)).toBeUndefined();
  });

  it("rechaza negativos", () => {
    expect(parseOptionalInt(-1)).toBeUndefined();
  });

  it("rechaza decimales", () => {
    expect(parseOptionalInt(1.5)).toBeUndefined();
  });

  it("rechaza string no numerico", () => {
    expect(parseOptionalInt("abc")).toBeUndefined();
  });

  it("rechaza undefined", () => {
    expect(parseOptionalInt(undefined)).toBeUndefined();
  });

  it("rechaza null", () => {
    expect(parseOptionalInt(null)).toBeUndefined();
  });

  it("rechaza string vacio", () => {
    expect(parseOptionalInt("")).toBeUndefined();
  });
});

describe("parseOptionalNumber", () => {
  it("acepta enteros", () => {
    expect(parseOptionalNumber(5)).toBe(5);
  });

  it("acepta decimales", () => {
    expect(parseOptionalNumber(1.5)).toBe(1.5);
  });

  it("acepta negativos", () => {
    expect(parseOptionalNumber(-3.14)).toBe(-3.14);
  });

  it("acepta cero", () => {
    expect(parseOptionalNumber(0)).toBe(0);
  });

  it("coerce string", () => {
    expect(parseOptionalNumber("2.5")).toBe(2.5);
  });

  it("rechaza string no numerico", () => {
    expect(parseOptionalNumber("abc")).toBeUndefined();
  });

  it("rechaza undefined", () => {
    expect(parseOptionalNumber(undefined)).toBeUndefined();
  });

  it("rechaza Infinity", () => {
    expect(parseOptionalNumber(Infinity)).toBeUndefined();
  });
});

describe("parsePagination", () => {
  it("aplica defaults sin query", () => {
    const r = parsePagination();
    expect(r).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it("aplica defaults con query vacio", () => {
    const r = parsePagination({});
    expect(r).toEqual({ page: 1, pageSize: 20, skip: 0 });
  });

  it("calcula skip para pagina 3 con pageSize 20", () => {
    const r = parsePagination({ page: 3, pageSize: 20 });
    expect(r).toEqual({ page: 3, pageSize: 20, skip: 40 });
  });

  it("coerce page desde string", () => {
    const r = parsePagination({ page: "2" });
    expect(r.page).toBe(2);
  });

  it("clamp page minimo en 1", () => {
    const r = parsePagination({ page: 0 });
    expect(r.page).toBe(1);
  });

  it("clamp page minimo en 1 con valor negativo", () => {
    const r = parsePagination({ page: -5 });
    expect(r.page).toBe(1);
  });

  it("clamp pageSize maximo en 100", () => {
    const r = parsePagination({ pageSize: 500 });
    expect(r.pageSize).toBe(100);
  });

  it("clamp pageSize minimo en 1", () => {
    const r = parsePagination({ pageSize: 0 });
    expect(r.pageSize).toBe(1);
  });

  it("clamp pageSize minimo con negativo", () => {
    const r = parsePagination({ pageSize: -10 });
    expect(r.pageSize).toBe(1);
  });

  it("acepta page y pageSize como strings", () => {
    const r = parsePagination({ page: "4", pageSize: "50" });
    expect(r).toEqual({ page: 4, pageSize: 50, skip: 150 });
  });
});
