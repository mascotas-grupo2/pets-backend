import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "./catalog-constants.js";

export interface AuthUserContext {
  id: number;
  role?: string;
}

export function canViewPet(mascota: Pet, authUser?: AuthUserContext) {
  // Público: solo reportes activos de mascotas perdidas o en adopción. Los
  // demás estados del flujo del refugio son internos (dashboard del refugio).
  const publiclyVisible =
    mascota.reportStatusId === CatalogIds.petReportStatus.activo &&
    (mascota.statusId === CatalogIds.petStatus.perdido ||
      mascota.statusId === CatalogIds.petStatus.adopcion);
  if (publiclyVisible) return true;
  if (!authUser) return false;
  if (authUser.role === "admin") return true;
  return mascota.userId === authUser.id;
}
