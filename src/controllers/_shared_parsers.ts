export function parseOptionalInt(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}
