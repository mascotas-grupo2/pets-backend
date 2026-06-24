import { Request, Response } from "express";
import { ILike, In } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Adoption } from "../entity/Adoption.js";
import { AdoptionCheck } from "../entity/AdoptionCheck.js";
import { AdoptionNote } from "../entity/AdoptionNote.js";
import { Followup } from "../entity/Followup.js";
import { Message } from "../entity/Message.js";
import { Notification } from "../entity/Notification.js";
import { Pet } from "../entity/Pet.js";
import { PetNote } from "../entity/PetNote.js";
import { User } from "../entity/User.js";
import { Catalog, CatalogIds, CatalogName, catalogItemForId } from "../lib/catalog-constants.js";
import { tenantScope } from "../lib/tenant.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { uploadFileToMinio } from "../lib/minio.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";
import { calculateCompatibility } from "../lib/matching.js";
import { recordActivity } from "../lib/activity.js";

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalBoolean = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return undefined;
}, z.boolean().optional());

const catalogReference = z.preprocess(
  (value) => {
    if (value === "" || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  },
  z
    .union([
      z.string().trim().min(1).max(80),
      z.number().int().positive(),
    ])
    .optional(),
);

const adminUserRoleSchema = z.object({
  roleId: optionalPositiveInt,
  role: catalogReference.optional(),
});

const adminListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().min(1).max(120).optional(),
  adopter: optionalBoolean,
  roleId: optionalPositiveInt,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function userRepo() {
  return dbManager().getRepository(User);
}

function petRepo() {
  return dbManager().getRepository(Pet);
}

function splitName(name: string) {
  const [firstName, ...rest] = (name || "").trim().split(/\s+/);
  return { firstName: firstName || name, lastName: rest.join(" ") || "" };
}

function catalogCode(id: number | null | undefined) {
  return catalogItemForId(id)?.code ?? null;
}

function catalogLabel(id: number | null | undefined) {
  return catalogItemForId(id)?.label ?? null;
}

function handleCatalogError(error: unknown, res: Response) {
  if (error instanceof CatalogValidationError) {
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

async function resolveCatalogId(
  catalog: CatalogName,
  id: number | null | undefined,
  code: string | number | null | undefined,
  required: boolean,
) {
  return resolveCatalogValueId(catalog, { id, code }, required);
}

function normalizeYesNoNAId(id: number | null | undefined) {
  if (id === CatalogIds.yesNo.si) return CatalogIds.yesNoNA.si;
  if (id === CatalogIds.yesNo.no) return CatalogIds.yesNoNA.no;
  return id;
}

async function resolveAdoptionCatalogIds(values: AdoptionInput) {
  return {
    preferredAnimalTypeId: await resolveCatalogId(
      Catalog.ANIMAL_TYPE,
      values.preferredAnimalTypeId,
      values.preferredAnimal,
      false,
    ),
    hasGardenId: await resolveCatalogId(Catalog.YES_NO, values.hasGardenId, values.hasGarden, true),
    livingSituationId: await resolveCatalogId(
      Catalog.LIVING_SITUATION,
      values.livingSituationId,
      values.livingSituation,
      true,
    ),
    householdSettingId: await resolveCatalogId(
      Catalog.HOUSEHOLD_SETTING,
      values.householdSettingId,
      values.householdSetting,
      true,
    ),
    activityLevelId: await resolveCatalogId(
      Catalog.ACTIVITY_LEVEL,
      values.activityLevelId,
      values.activityLevel,
      true,
    ),
    visitingChildrenId: await resolveCatalogId(
      Catalog.YES_NO,
      values.visitingChildrenId,
      values.visitingChildren,
      true,
    ),
    hasFlatmatesId: await resolveCatalogId(
      Catalog.YES_NO,
      values.hasFlatmatesId,
      values.hasFlatmates,
      true,
    ),
    otherAnimalsId: await resolveCatalogId(Catalog.YES_NO, values.otherAnimalsId, values.otherAnimals, true),
    neuteredId: await resolveCatalogId(Catalog.YES_NO_NA, normalizeYesNoNAId(values.neuteredId), values.neutered, true),
    vaccinatedId: await resolveCatalogId(Catalog.YES_NO_NA, normalizeYesNoNAId(values.vaccinatedId), values.vaccinated, true),
  };
}

export function publicUser(user: User) {
  const {
    passwordHash,
    passwordSalt,
    refreshTokenHash,
    emailVerificationTokenHash,
    passwordResetTokenHash,
    passwordResetExpiresAt,
    ...safe
  } = user as User & {
    passwordHash?: string;
    passwordSalt?: string;
    refreshTokenHash?: string | null;
    emailVerificationTokenHash?: string | null;
    passwordResetTokenHash?: string | null;
    passwordResetExpiresAt?: Date | null;
  };

  const role = catalogCode(safe.roleId) ?? "user";
  const ssoProvider = catalogCode(safe.ssoProviderId);

  return {
    ...safe,
    role,
    roleLabel: catalogLabel(safe.roleId),
    ssoProvider,
    ssoProviderLabel: catalogLabel(safe.ssoProviderId),
    firstName: (safe as any).firstName ?? splitName(safe.name).firstName,
    lastName: (safe as any).lastName ?? splitName(safe.name).lastName,
  } as any;
}

export async function getCommonInfo(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  res.json({ name: user.name, photo: user.photo });
}

export async function getMe(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(401).json({ error: "Usuario no autenticado" });
  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(publicUser(user));
}

export async function getUserDetails(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const reports = await petRepo().find({ where: { userId: id }, order: { createdAt: "DESC" } });

  const adoptionRepo = dbManager().getRepository(Adoption);
  const latest = await adoptionRepo.findOne({ where: { userId: id }, order: { createdAt: "DESC" } });

  const safe = publicUser(user);
  const catalogValuesById = await getCatalogValuesById();
  const item = (valueId: number | null | undefined) =>
    valueId ? catalogValuesById.get(valueId) ?? null : null;

  res.json({
    reports: reports.map((pet) => ({
      id: pet.id,
      title: pet.name ?? item(pet.animalTypeId)?.label ?? "Mascota",
      description: pet.description,
      status: item(pet.statusId)?.code ?? null,
      statusId: pet.statusId,
      reportStatus: item((pet as any).reportStatusId)?.code ?? null,
      reportStatusId: (pet as any).reportStatusId,
      created_at: pet.createdAt.toISOString(),
    })),
    photo: safe.photo,
    email: safe.email,
    messages: [],
    notifications: [],
    created_at: user.createdAt.toISOString(),
    addressLine1: latest?.addressLine1 ?? null,
    addressLine2: latest?.addressLine2 ?? null,
    firstName: latest?.firstName ?? safe.firstName ?? null,
    lastName: latest?.lastName ?? safe.lastName ?? null,
    phone: latest?.phone ?? null,
    postcode: latest?.postcode ?? null,
    town: latest?.town ?? null,
    preferredAnimal: item(latest?.preferredAnimalTypeId)?.code ?? null,
    preferredAnimalTypeId: latest?.preferredAnimalTypeId ?? null,
    hasGarden: item(latest?.hasGardenId)?.code ?? null,
    hasGardenId: latest?.hasGardenId ?? null,
    livingSituation: item(latest?.livingSituationId)?.code ?? null,
    livingSituationId: latest?.livingSituationId ?? null,
    householdSetting: item(latest?.householdSettingId)?.code ?? null,
    householdSettingId: latest?.householdSettingId ?? null,
    activityLevel: item(latest?.activityLevelId)?.code ?? null,
    activityLevelId: latest?.activityLevelId ?? null,
    adults: latest?.adults ?? null,
    children: latest?.children ?? null,
    visitingChildren: item(latest?.visitingChildrenId)?.code ?? null,
    visitingChildrenId: latest?.visitingChildrenId ?? null,
    hasFlatmates: item(latest?.hasFlatmatesId)?.code ?? null,
    hasFlatmatesId: latest?.hasFlatmatesId ?? null,
    allergies: latest?.allergies ?? null,
    otherAnimals: item(latest?.otherAnimalsId)?.code ?? null,
    otherAnimalsId: latest?.otherAnimalsId ?? null,
    otherAnimalsDetail: latest?.otherAnimalsDetail ?? null,
    neutered: item(latest?.neuteredId)?.code ?? null,
    neuteredId: latest?.neuteredId ?? null,
    vaccinated: item(latest?.vaccinatedId)?.code ?? null,
    vaccinatedId: latest?.vaccinatedId ?? null,
  });
}

export async function submitAdoption(req: Request, res: Response) {
  const parsed = adoptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const values: AdoptionInput = parsed.data;
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(401).json({ error: "Usuario no autenticado" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  let catalogIds: Awaited<ReturnType<typeof resolveAdoptionCatalogIds>>;
  try {
    catalogIds = await resolveAdoptionCatalogIds(values);
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  try {
    const adoptionRepo = dbManager().getRepository(Adoption);
    const adoption = adoptionRepo.create({
      userId: id,
      petId: values.petId ?? null,
      ...catalogIds,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      addressLine1: values.addressLine1,
      addressLine2: values.addressLine2 || null,
      postcode: values.postcode,
      town: values.town,
      adults: values.adults,
      children: values.children,
      allergies: values.allergies || null,
      otherAnimalsDetail: values.otherAnimalsDetail || null,
      experience: values.experience || null,
      acceptsTerms: values.acceptsTerms,
      kind: values.kind,
      statusId: CatalogIds.adoptionStatus.nueva,
    });

    if (adoption.petId) {
      const pet = await petRepo().findOneBy({ id: adoption.petId });
      if (pet) {
        adoption.compatibilityScore = calculateCompatibility(adoption, pet).score;
      }
    }

    await adoptionRepo.save(adoption);
    await recordActivity({
      type: "solicitud",
      title: `Nueva ${values.kind === "transito" ? "oferta de tránsito" : "solicitud"} de ${values.firstName} ${values.lastName}`.trim(),
      actorUserId: id as number,
      refType: "adoption",
      refId: adoption.id,
      link: `/admin/solicitudes?requestId=${adoption.id}`,
    });
  } catch (e) {
    // No tragamos el error: si la solicitud no se guardó, NO reportamos éxito
    // (antes devolvía 201 igual y el usuario veía "¡Éxito!" sin que existiera).
    console.error("No se pudo guardar la solicitud de adopción:", e);
    return res
      .status(500)
      .json({ error: "No se pudo guardar tu solicitud. Por favor, intentá de nuevo." });
  }

  // El usuario pasa a adoptante SOLO después de que la solicitud se guardó bien.
  const wasAdopter = user.adopter;
  const updated = await userRepo().save({ ...user, adopter: true });
  if (!wasAdopter) {
    await recordActivity({
      type: "adoptante_nuevo",
      title: `Nuevo adoptante: ${updated.name}`,
      actorUserId: updated.id,
      refType: "user",
      refId: updated.id,
      link: "/admin/personas",
    });
  }

  res.status(201).json(publicUser(updated));
}

// Campos de contacto/hogar que el form de Configuración manda. NO viven en User
// sino en Adoption (la fila más reciente del usuario, que es de donde
// `getUserDetails` los lee). Acá los persistimos para que dejen de descartarse
// en silencio (antes updateUser solo guardaba name/photo).
const PROFILE_STRING_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "addressLine1",
  "addressLine2",
  "postcode",
  "town",
  "allergies",
  "otherAnimalsDetail",
  "experience",
] as const;

// Campos del form que pueden quedar en null cuando llegan vacíos.
const PROFILE_NULLABLE_STRINGS = new Set([
  "addressLine2",
  "allergies",
  "otherAnimalsDetail",
  "experience",
]);

// [columna de id en Adoption, catálogo, clave de código en el body, clave de id en el body]
const PROFILE_CATALOG_FIELDS: Array<[string, CatalogName, string, string]> = [
  ["livingSituationId", Catalog.LIVING_SITUATION, "livingSituation", "livingSituationId"],
  ["householdSettingId", Catalog.HOUSEHOLD_SETTING, "householdSetting", "householdSettingId"],
  ["activityLevelId", Catalog.ACTIVITY_LEVEL, "activityLevel", "activityLevelId"],
  ["hasGardenId", Catalog.YES_NO, "hasGarden", "hasGardenId"],
  ["otherAnimalsId", Catalog.YES_NO, "otherAnimals", "otherAnimalsId"],
  ["visitingChildrenId", Catalog.YES_NO, "visitingChildren", "visitingChildrenId"],
  ["hasFlatmatesId", Catalog.YES_NO, "hasFlatmates", "hasFlatmatesId"],
  ["neuteredId", Catalog.YES_NO_NA, "neutered", "neuteredId"],
  ["vaccinatedId", Catalog.YES_NO_NA, "vaccinated", "vaccinatedId"],
  ["preferredAnimalTypeId", Catalog.ANIMAL_TYPE, "preferredAnimal", "preferredAnimalTypeId"],
];

/**
 * Upsert de los datos de contacto/hogar en la fila Adoption más reciente del
 * usuario (o crea una fila "perfil" sin petId si todavía no tiene ninguna).
 * Solo toca los campos presentes en el body. Puede lanzar CatalogValidationError.
 */
async function saveUserProfileContact(user: User, body: Record<string, unknown>) {
  const adoptionRepo = dbManager().getRepository(Adoption);
  let profile = await adoptionRepo.findOne({
    where: { userId: user.id },
    order: { createdAt: "DESC" },
  });
  const isNew = !profile;
  if (!profile) profile = adoptionRepo.create({ userId: user.id, petId: null });

  for (const key of PROFILE_STRING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    const str = typeof value === "string" ? value : value == null ? "" : String(value);
    (profile as any)[key] =
      str === "" ? (PROFILE_NULLABLE_STRINGS.has(key) ? null : "") : str;
  }

  for (const key of ["adults", "children"] as const) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const n = Number(body[key]);
    (profile as any)[key] = Number.isFinite(n) ? n : null;
  }

  for (const [field, catalog, codeKey, idKey] of PROFILE_CATALOG_FIELDS) {
    const hasCode = Object.prototype.hasOwnProperty.call(body, codeKey);
    const hasId = Object.prototype.hasOwnProperty.call(body, idKey);
    if (!hasCode && !hasId) continue;
    const code = body[codeKey] as string | number | null | undefined;
    const idVal = body[idKey] as string | number | null | undefined;
    if ((code === "" || code == null) && (idVal === "" || idVal == null)) {
      (profile as any)[field] = null;
      continue;
    }
    const numericId = typeof idVal === "number" ? idVal : Number(idVal);
    (profile as any)[field] = await resolveCatalogValueId(
      catalog,
      { id: Number.isFinite(numericId) ? numericId : undefined, code },
      false,
    );
  }

  // Defaults para las columnas NOT NULL cuando se crea la fila de perfil.
  if (isNew) {
    profile.firstName = profile.firstName || splitName(user.name).firstName || "";
    profile.lastName = profile.lastName || splitName(user.name).lastName || "";
    profile.phone = profile.phone || "";
    profile.addressLine1 = profile.addressLine1 || "";
    profile.postcode = profile.postcode || "";
    profile.town = profile.town || "";
  }
  // El email del perfil siempre refleja el del usuario (no es editable acá).
  profile.email = user.email;

  await adoptionRepo.save(profile);
}

export async function updateUser(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const body = req.body || {};

  const updates: Partial<User> = {};
  const allowedStringFields = ["photo", "name"];
  for (const key of allowedStringFields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      // @ts-ignore
      updates[key] = body[key] === "" ? null : body[key];
    }
  }
  // Si mandan nombre/apellido por separado (form de Configuración) y no `name`,
  // recomponemos el name del usuario para que se mantenga sincronizado.
  if (
    !Object.prototype.hasOwnProperty.call(body, "name") &&
    (Object.prototype.hasOwnProperty.call(body, "firstName") ||
      Object.prototype.hasOwnProperty.call(body, "lastName"))
  ) {
    const fn = String((body as any).firstName ?? "").trim();
    const ln = String((body as any).lastName ?? "").trim();
    const composed = `${fn} ${ln}`.trim();
    if (composed) updates.name = composed;
  }

  // Persistimos los datos de contacto/hogar ANTES de guardar el user, así si un
  // catálogo es inválido devolvemos 400 sin haber modificado nada a medias.
  try {
    await saveUserProfileContact(user, body);
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }

  const merged = await userRepo().save({ ...user, ...updates });
  res.json(publicUser(merged));
}

/**
 * Borra un usuario y todo lo asociado en una transacción: sus mascotas (con sus
 * seguimientos/notas), sus solicitudes (con checks/notas), seguimientos donde es
 * responsable, mensajes y notificaciones. Las notas/checks que creó en registros
 * de otros se despersonalizan (authorId/checkedBy → null) para conservar la
 * auditoría sin dejar FKs colgadas.
 */
export async function deleteUserCascade(userId: number) {
  await dbManager().transaction(async (m) => {
    const pets = await m.getRepository(Pet).find({ where: { userId } });
    const petIds = pets.map((p) => p.id);
    if (petIds.length) {
      await m.getRepository(Followup).delete({ petId: In(petIds) });
      await m.getRepository(PetNote).delete({ petId: In(petIds) });
      await m.getRepository(Pet).delete({ id: In(petIds) });
    }

    await m.getRepository(Followup).delete({ userId });

    const adoptions = await m.getRepository(Adoption).find({ where: { userId } });
    const adoptionIds = adoptions.map((a) => a.id);
    if (adoptionIds.length) {
      await m.getRepository(AdoptionCheck).delete({ adoptionId: In(adoptionIds) });
      await m.getRepository(AdoptionNote).delete({ adoptionId: In(adoptionIds) });
      await m.getRepository(Adoption).delete({ id: In(adoptionIds) });
    }

    await m.getRepository(Message).delete([{ senderId: userId }, { receiverId: userId }]);
    await m.getRepository(Notification).delete({ userId });

    await m.getRepository(AdoptionNote).update({ authorId: userId }, { authorId: null });
    await m.getRepository(PetNote).update({ authorId: userId }, { authorId: null });
    await m.getRepository(AdoptionCheck).update({ checkedBy: userId }, { checkedBy: null });

    await m.getRepository(User).delete({ id: userId });
  });
}

/**
 * Lista de admins contactables por cualquier usuario autenticado (para que un
 * usuario común pueda iniciar una conversación con el refugio/soporte). Devuelve
 * solo datos públicos mínimos.
 */
export async function listContactableAdmins(_req: Request, res: Response) {
  const admins = await userRepo().find({
    where: { roleId: CatalogIds.userRole.admin },
    order: { name: "ASC" },
  });
  res.json(
    admins.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      photo: a.photo,
      role: "admin",
    })),
  );
}

export async function adminDeleteUser(req: Request, res: Response) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) return res.status(400).json({ error: "Id invalido" });

  const target = await userRepo().findOneBy({ id: targetId });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });

  if (req.authUser?.id === targetId) {
    return res
      .status(400)
      .json({ error: "No podés eliminar tu propia cuenta desde el panel." });
  }

  if (target.roleId === CatalogIds.userRole.admin) {
    const adminCount = await userRepo().count({
      where: { roleId: CatalogIds.userRole.admin },
    });
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({ error: "No podés dejar al sistema sin administradores." });
    }
  }

  await deleteUserCascade(targetId);
  res.status(204).send();
}

// Sort server-side (mismo patrón que solicitudes): ?sort=campo:ASC,campo2:DESC
const USER_SORT_MAP: Record<string, string> = {
  name: "name",
  email: "email",
  role: "roleId",
  createdAt: "createdAt",
  id: "id",
};
function parseUserOrder(req: Request): Record<string, "ASC" | "DESC"> {
  const raw = typeof req.query.sort === "string" ? req.query.sort : "";
  const order: Record<string, "ASC" | "DESC"> = {};
  for (const seg of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [field, dir] = seg.split(":").map((p) => p.trim());
    const column = USER_SORT_MAP[field];
    if (column) order[column] = dir?.toUpperCase() === "DESC" ? "DESC" : "ASC";
  }
  if (Object.keys(order).length === 0) order.id = "ASC";
  return order;
}

export async function adminListUsers(req: Request, res: Response) {
  const parsed = adminListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { search, name, email, adopter, roleId, page, pageSize } = parsed.data;

  const baseWhere: Record<string, unknown> = {};
  if (roleId) baseWhere.roleId = roleId;
  if (typeof adopter === "boolean") baseWhere.adopter = adopter;
  if (name) baseWhere.name = ILike(`%${name}%`);
  if (email) baseWhere.email = ILike(`%${email}%`);

  // Scope multi-tenant: el admin de refugio ve su staff + los adoptantes que
  // postularon a mascotas de su refugio. El superadmin ve todos.
  const scope = tenantScope(req.authUser);
  let scopedIds: number[] | null = null;
  if (scope.scoped) {
    const rid = scope.refugioId ?? -1;
    const staff = await userRepo().find({ where: { refugioId: rid }, select: ["id"] });
    const adopterRows = await dbManager().getRepository(Adoption)
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
    scopedIds = ids.size ? Array.from(ids) : [-1];
    baseWhere.id = In(scopedIds);
  }

  const hasSpecificFilters = Boolean(name || email);
  const finalWhere =
    search && !hasSpecificFilters
      ? [
          { ...baseWhere, name: ILike(`%${search}%`) },
          { ...baseWhere, email: ILike(`%${search}%`) },
        ]
      : baseWhere;

  const [users, total] = await userRepo().findAndCount({
    where: finalWhere as any,
    order: parseUserOrder(req),
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Totales globales (no dependen de los filtros) para las cards del panel.
  const totalsScope = scopedIds ? { id: In(scopedIds) } : {};
  const [totalAll, admins, adopters, comunes] = await Promise.all([
    userRepo().count({ where: { ...totalsScope } }),
    userRepo().count({ where: { roleId: CatalogIds.userRole.admin, ...totalsScope } }),
    userRepo().count({ where: { adopter: true, ...totalsScope } }),
    // "Comunes" = usuario común que todavía no es adoptante.
    userRepo().count({
      where: { roleId: CatalogIds.userRole.user, adopter: false, ...totalsScope },
    }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    totals: { total: totalAll, admins, adopters, comunes },
    items: users.map((u) => {
      const safe = publicUser(u);
      return {
        id: safe.id,
        name: safe.name,
        email: safe.email,
        role: safe.role,
        roleId: safe.roleId,
        adopter: safe.adopter,
        emailVerified: safe.emailVerified,
        ssoProvider: safe.ssoProvider,
        ssoProviderId: safe.ssoProviderId,
        photo: safe.photo,
        createdAt: u.createdAt,
      };
    }),
  });
}

export async function adminUpdateUserRole(req: Request, res: Response) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: "Id invalido" });
  }

  const parsed = adminUserRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let newRoleId: number | null;
  try {
    newRoleId = await resolveCatalogValueId(
      Catalog.USER_ROLE,
      { id: parsed.data.roleId, code: parsed.data.role },
      true,
    );
  } catch (error) {
    if (handleCatalogError(error, res)) return;
    throw error;
  }
  if (!newRoleId) return res.status(400).json({ error: "Rol requerido" });

  const target = await userRepo().findOneBy({ id: targetId });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });

  if (target.roleId === newRoleId) {
    return res.json(publicUser(target));
  }

  if (
    req.authUser?.id === target.id &&
    target.roleId === CatalogIds.userRole.admin &&
    newRoleId !== CatalogIds.userRole.admin
  ) {
    return res
      .status(400)
      .json({ error: "No podés quitarte el rol de admin a vos mismo" });
  }

  if (target.roleId === CatalogIds.userRole.admin && newRoleId !== CatalogIds.userRole.admin) {
    const adminCount = await userRepo().count({
      where: { roleId: CatalogIds.userRole.admin },
    });
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({ error: "No podés dejar al sistema sin administradores" });
    }
  }

  target.roleId = newRoleId;
  const saved = await userRepo().save(target);
  res.json(publicUser(saved));
}

export async function uploadProfilePhoto(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(401).json({ error: "Usuario no autenticado" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: "No se subió ningún archivo" });

  const bucket = process.env.MINIO_PROFILE_BUCKET ?? "profile";
  try {
    const url = await uploadFileToMinio(bucket, String(id), file.originalname, file.buffer, file.mimetype);
    const merged = await userRepo().save({ ...user, photo: url });
    res.json(publicUser(merged));
  } catch (e: any) {
    console.warn("Error subiendo foto de perfil:", e);
    if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Archivo demasiado grande" });
    res.status(500).json({ error: "No se pudo subir la foto" });
  }
}
