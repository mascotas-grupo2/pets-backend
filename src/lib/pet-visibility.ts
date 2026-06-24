import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "./catalog-constants.js";

export interface AuthUserContext {
  id: number;
  role?: string;
}

export function canViewPet(mascota: Pet, authUser?: AuthUserContext) {
  if (mascota.reportStatusId === CatalogIds.petReportStatus.activo) return true;
  if (!authUser) return false;
  if (authUser.role === "admin") return true;
  return mascota.userId === authUser.id;
}
