import { AppDataSource } from "../data-source.js";
import { CatalogValue } from "../entity/CatalogValue.js";
import {
  catalogIdForCode,
  CatalogName,
  CatalogSeed,
} from "./catalog-constants.js";

type CatalogReference = string | number | null | undefined;

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

function repo() {
  return AppDataSource.getRepository(CatalogValue);
}

function numericReference(value: CatalogReference) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function listCatalogValues(catalog?: CatalogName) {
  return repo().find({
    where: catalog ? { catalog } : undefined,
    order: { catalog: "ASC", id: "ASC" },
  });
}

export async function getCatalogValuesById() {
  return new Map((await listCatalogValues()).map((item) => [item.id, item]));
}

export async function resolveCatalogValueId(
  catalog: CatalogName,
  input: { id?: number | null; code?: CatalogReference },
  required = true,
) {
  const id = input.id ?? numericReference(input.code);
  if (id) {
    const found = await repo().findOneBy({ id, catalog });
    if (!found) {
      throw new CatalogValidationError(`Valor invalido para ${catalog}: ${id}`);
    }
    return found.id;
  }

  if (typeof input.code === "string" && input.code.trim() !== "") {
    const code = input.code.trim();
    const seedId = catalogIdForCode(catalog, code);
    const found = seedId
      ? await repo().findOneBy({ id: seedId, catalog })
      : await repo().findOneBy({ catalog, code });
    if (!found) {
      throw new CatalogValidationError(`Valor invalido para ${catalog}: ${code}`);
    }
    return found.id;
  }

  if (required) {
    throw new CatalogValidationError(`El valor ${catalog} es requerido`);
  }

  return null;
}

export async function seedCatalogValues() {
  await repo().upsert(CatalogSeed, ["id"]);
}
