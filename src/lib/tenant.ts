import { AppDataSource } from "../data-source.js";
import { IsNull } from "typeorm";
import { dbManager } from "./db-context.js";
import { Refugio } from "../entity/Refugio.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { Adoption } from "../entity/Adoption.js";
import { CatalogIds } from "./catalog-constants.js";
import type { AuthUser } from "./auth.js";
import type { FindOptionsWhere, ObjectLiteral, SelectQueryBuilder } from "typeorm";

export const DEFAULT_REFUGIO_SLUG =
  process.env.DEFAULT_REFUGIO_SLUG ?? "refugio-moron";

let cachedDefaultId: number | null = null;

export async function getDefaultRefugioId(): Promise<number | null> {
  if (cachedDefaultId != null) return cachedDefaultId;
  const refugio = await AppDataSource.getRepository(Refugio).findOneBy({
    slug: DEFAULT_REFUGIO_SLUG,
  });
  cachedDefaultId = refugio?.id ?? null;
  return cachedDefaultId;
}

export function isSuperadmin(authUser?: AuthUser | null): boolean {
  return authUser?.role === "superadmin";
}

export function refugioIdOf(authUser?: AuthUser | null): number | null {
  return authUser?.refugioId ?? null;
}

export type TenantScope = { scoped: boolean; refugioId: number | null };

export function tenantScope(authUser?: AuthUser | null): TenantScope {
  if (isSuperadmin(authUser)) return { scoped: false, refugioId: null };
  return { scoped: true, refugioId: refugioIdOf(authUser) };
}

export function tenantWhere(authUser?: AuthUser | null): { refugioId?: number } {
  const scope = tenantScope(authUser);
  if (!scope.scoped) return {};
  return { refugioId: scope.refugioId ?? -1 };
}

export function applyTenantScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  authUser?: AuthUser | null,
): SelectQueryBuilder<T> {
  const scope = tenantScope(authUser);
  if (scope.scoped) {
    qb.andWhere(`${alias}.refugioId = :tenantRefugioId`, {
      tenantRefugioId: scope.refugioId ?? -1,
    });
  }
  return qb;
}

export const MANAGED_PET_STATUS: number[] = [
  CatalogIds.petStatus.transito,
  CatalogIds.petStatus.medico,
  CatalogIds.petStatus.adopcion,
  CatalogIds.petStatus.adoptado,
  CatalogIds.petStatus.devueltaAlDueno,
];

export function stampRefugioIfManaged(
  pet: { refugioId: number | null; statusId: number },
  authUser?: AuthUser | null,
): void {
  if (pet.refugioId != null) return;
  const rid = refugioIdOf(authUser);
  if (rid == null) return;
  if (MANAGED_PET_STATUS.includes(pet.statusId)) {
    pet.refugioId = rid;
  }
}

// Visibilidad de mascotas para un admin: las que gestiona su refugio MÁS las que
// no tienen dueño (refugio_id NULL), es decir los reportes públicos de mascotas
// perdidas, que son cross-refugio. El superadmin ve todo.
export function petVisibilityWhere(
  base: FindOptionsWhere<Pet>,
  authUser?: AuthUser | null,
): FindOptionsWhere<Pet> | FindOptionsWhere<Pet>[] {
  const scope = tenantScope(authUser);
  if (!scope.scoped) return base;
  return [
    { ...base, refugioId: scope.refugioId ?? -1 },
    { ...base, refugioId: IsNull() },
  ];
}

export function applyPetVisibility<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  alias: string,
  authUser?: AuthUser | null,
): SelectQueryBuilder<T> {
  const scope = tenantScope(authUser);
  if (scope.scoped) {
    qb.andWhere(
      `(${alias}.refugioId = :petTenantRefugioId OR ${alias}.refugioId IS NULL)`,
      { petTenantRefugioId: scope.refugioId ?? -1 },
    );
  }
  return qb;
}

/**
 * IDs de los usuarios "del refugio" del solicitante: su staff (users.refugioId)
 * MÁS los adoptantes que postularon a una mascota de ese refugio. Devuelve null
 * para el superadmin sin scope (= todos los usuarios). Si el refugio no tiene
 * usuarios, devuelve [-1] (no matchea a nadie). Es la misma definición que usa
 * la lista de Personas, para que métricas y listado sean consistentes.
 */
export async function scopedUserIds(
  authUser?: AuthUser | null,
): Promise<number[] | null> {
  const scope = tenantScope(authUser);
  if (!scope.scoped) return null;
  const rid = scope.refugioId ?? -1;
  const staff = await dbManager()
    .getRepository(User)
    .find({ where: { refugioId: rid }, select: ["id"] });
  const adopterRows = await dbManager()
    .getRepository(Adoption)
    .createQueryBuilder("a")
    .select("DISTINCT a.userId", "userId")
    .where("a.refugioId = :rid", { rid })
    .andWhere("a.userId IS NOT NULL")
    .getRawMany<{ userId: number }>();
  const ids = new Set<number>(staff.map((u) => u.id));
  for (const row of adopterRows) {
    const id = Number(row.userId);
    if (Number.isInteger(id)) ids.add(id);
  }
  return ids.size ? Array.from(ids) : [-1];
}
