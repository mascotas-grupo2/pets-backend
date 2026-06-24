export function parseOptionalInt(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return undefined;
  return numeric;
}

export function parseOptionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return numeric;
}

export interface PaginationParams {
  page?: unknown;
  pageSize?: unknown;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
}

export function parsePagination(query: PaginationParams = {}): PaginationResult {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
