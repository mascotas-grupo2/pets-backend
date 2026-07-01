import { AppDataSource } from "../data-source.js";
import { User } from "../entity/User.js";
import { CatalogIds } from "./catalog-constants.js";
import { getDefaultRefugioId } from "./tenant.js";

function parseEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmailsFromEnv(): string[] {
  return parseEmails(process.env.ADMIN_EMAILS);
}

export function getSuperadminEmailsFromEnv(): string[] {
  return parseEmails(process.env.SUPERADMIN_EMAILS);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailsFromEnv().includes(email.toLowerCase());
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getSuperadminEmailsFromEnv().includes(email.toLowerCase());
}

export async function resolveInitialRole(
  email: string | null | undefined,
): Promise<{ roleId: number; refugioId: number | null }> {
  if (isSuperadminEmail(email)) {
    return { roleId: CatalogIds.userRole.superadmin, refugioId: null };
  }
  if (isAdminEmail(email)) {
    return {
      roleId: CatalogIds.userRole.admin,
      refugioId: await getDefaultRefugioId(),
    };
  }
  return { roleId: CatalogIds.userRole.user, refugioId: null };
}

export async function bootstrapAdmins() {
  const adminEmails = getAdminEmailsFromEnv();
  const superadminEmails = getSuperadminEmailsFromEnv();
  if (adminEmails.length === 0 && superadminEmails.length === 0) return;

  const repo = AppDataSource.getRepository(User);
  const defaultRefugioId = await getDefaultRefugioId();
  let promoted = 0;
  const missing: string[] = [];

  for (const email of superadminEmails) {
    const user = await repo.findOneBy({ email });
    if (!user) {
      missing.push(email);
      continue;
    }
    let changed = false;
    if (user.roleId !== CatalogIds.userRole.superadmin) {
      user.roleId = CatalogIds.userRole.superadmin;
      changed = true;
    }
    if (user.refugioId != null) {
      user.refugioId = null;
      changed = true;
    }
    if (changed) {
      await repo.save(user);
      promoted++;
    }
  }

  for (const email of adminEmails) {
    if (superadminEmails.includes(email)) continue;
    const user = await repo.findOneBy({ email });
    if (!user) {
      missing.push(email);
      continue;
    }
    let changed = false;
    if (user.roleId !== CatalogIds.userRole.admin) {
      user.roleId = CatalogIds.userRole.admin;
      changed = true;
    }
    if (user.refugioId == null && defaultRefugioId != null) {
      user.refugioId = defaultRefugioId;
      changed = true;
    }
    if (changed) {
      await repo.save(user);
      promoted++;
    }
  }

  if (promoted > 0) {
    console.log(`[bootstrap-admins] Usuarios actualizados: ${promoted}`);
  }
  if (missing.length > 0) {
    console.warn(
      `[bootstrap-admins] No existen en la DB (se promoveran al registrarse): ${missing.join(", ")}`,
    );
  }
}
