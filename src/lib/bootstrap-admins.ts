import { AppDataSource } from "../data-source.js";
import { User } from "../entity/User.js";
import { CatalogIds } from "./catalog-constants.js";

export function getAdminEmailsFromEnv(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailsFromEnv().includes(email.toLowerCase());
}

export async function bootstrapAdmins() {
  const emails = getAdminEmailsFromEnv();
  if (emails.length === 0) return;

  const repo = AppDataSource.getRepository(User);
  let promoted = 0;
  let missing: string[] = [];

  for (const email of emails) {
    const user = await repo.findOneBy({ email });
    if (!user) {
      missing.push(email);
      continue;
    }
    if (user.roleId === CatalogIds.userRole.admin) continue;
    user.roleId = CatalogIds.userRole.admin;
    await repo.save(user);
    promoted++;
  }

  if (promoted > 0) {
    console.log(`[bootstrap-admins] Promovidos a admin: ${promoted}`);
  }
  if (missing.length > 0) {
    console.warn(
      `[bootstrap-admins] No existen en la DB (se promoverán al registrarse): ${missing.join(", ")}`,
    );
  }
}
