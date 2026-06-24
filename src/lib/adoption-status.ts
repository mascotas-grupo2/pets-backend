import { CatalogIds } from "./catalog-constants.js";
import { parseOptionalInt } from "./query-utils.js";

export const adoptionStatusEntries = [
  { code: "NUEVA", id: CatalogIds.adoptionStatus.nueva },
  { code: "EN_EVALUACION", id: CatalogIds.adoptionStatus.enEvaluacion },
  { code: "ENTREVISTA_PENDIENTE", id: CatalogIds.adoptionStatus.entrevistaPendiente },
  { code: "ACEPTADA_CON_SEGUIMIENTO", id: CatalogIds.adoptionStatus.aceptadaConSeguimiento },
  { code: "ACEPTADA", id: CatalogIds.adoptionStatus.aceptada },
  { code: "DESCARTADA", id: CatalogIds.adoptionStatus.descartada },
] as const;

export type AdoptionStatusId = (typeof adoptionStatusEntries)[number]["id"];
export type AdoptionStatusCode = (typeof adoptionStatusEntries)[number]["code"];

export const adoptionStatusById: Map<AdoptionStatusId, AdoptionStatusCode> = new Map(
  adoptionStatusEntries.map((entry) => [entry.id, entry.code]),
);
export const adoptionStatusByCode: Map<AdoptionStatusCode, AdoptionStatusId> = new Map(
  adoptionStatusEntries.map((entry) => [entry.code, entry.id]),
);

export function isAdoptionStatusId(value: number): value is AdoptionStatusId {
  return adoptionStatusById.has(value as AdoptionStatusId);
}

export function getAdoptionStatusCode(id: number | null | undefined): AdoptionStatusCode | undefined {
  if (typeof id !== "number" || !Number.isInteger(id)) return undefined;
  return isAdoptionStatusId(id) ? adoptionStatusById.get(id) : undefined;
}

export function parseStatusId(
  codeValue: unknown,
  idValue: unknown,
): AdoptionStatusId | undefined {
  const numericStatusId = parseOptionalInt(idValue);
  if (numericStatusId && isAdoptionStatusId(numericStatusId)) return numericStatusId;

  if (typeof codeValue !== "string") return undefined;
  const trimmed = codeValue.trim();
  if (!trimmed) return undefined;
  return adoptionStatusByCode.get(trimmed as AdoptionStatusCode) ?? undefined;
}

export const adoptionStatusChain: AdoptionStatusCode[] = [
  "NUEVA",
  "EN_EVALUACION",
  "ENTREVISTA_PENDIENTE",
  "ACEPTADA_CON_SEGUIMIENTO",
  "ACEPTADA",
];

export function isTerminalAdoptionStatus(code: AdoptionStatusCode) {
  return code === "ACEPTADA" || code === "DESCARTADA";
}

export function allowedNextAdoptionStatuses(
  code: AdoptionStatusCode,
): AdoptionStatusCode[] {
  if (isTerminalAdoptionStatus(code)) return [];
  const idx = adoptionStatusChain.indexOf(code);
  const next =
    idx >= 0 && idx < adoptionStatusChain.length - 1
      ? adoptionStatusChain[idx + 1]
      : null;
  const result: AdoptionStatusCode[] = [];
  if (next) result.push(next);
  result.push("DESCARTADA");
  return result;
}
