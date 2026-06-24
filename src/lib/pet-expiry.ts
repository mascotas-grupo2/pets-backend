import { CatalogIds } from "./catalog-constants.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_GRACE_DAYS = 15;
/** Cuántos días antes de vencer se manda el aviso previo ("está por vencer"). */
export const EXPIRY_WARN_DAYS = 3;

export function expiryFromStatus(
  statusId: number | null | undefined,
  from: Date,
): Date | null {
  const S = CatalogIds.petStatus;
  if (statusId === S.adoptado || statusId === S.devueltaAlDueno) return null;
  const days = statusId === S.perdido ? 30 : 60;
  return new Date(from.getTime() + days * DAY_MS);
}

export function expiryInfo(expiresAt: Date | null | undefined) {
  if (!expiresAt) return { daysLeft: null as number | null, expired: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  return { daysLeft: Math.ceil(ms / DAY_MS), expired: ms <= 0 };
}

/**
 * True si la publicación venció hace MÁS que el período de gracia. En ese caso
 * se oculta del público (listado y detalle); el dueño/dueño verificado y el admin
 * la siguen viendo para poder renovarla.
 */
export function isExpiredBeyondGrace(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  const overdueMs = Date.now() - new Date(expiresAt).getTime();
  return overdueMs > EXPIRY_GRACE_DAYS * DAY_MS;
}
