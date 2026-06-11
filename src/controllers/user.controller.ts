import { Request, Response } from "express";
import { ILike } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { Catalog, CatalogIds, CatalogName, catalogItemForId } from "../lib/catalog-constants.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
  resolveCatalogValueId,
} from "../lib/catalog-values.js";
import { uploadFileToMinio } from "../lib/minio.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";
import { calculateCompatibility } from "../lib/matching.js";

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
  return AppDataSource.getRepository(User);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
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
    neuteredId: await resolveCatalogId(Catalog.YES_NO_NA, values.neuteredId, values.neutered, true),
    vaccinatedId: await resolveCatalogId(Catalog.YES_NO_NA, values.vaccinatedId, values.vaccinated, true),
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

  const adoptionRepo = AppDataSource.getRepository(Adoption);
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
    const adoptionRepo = AppDataSource.getRepository(Adoption);
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
      statusId: CatalogIds.adoptionStatus.nueva,
    });

    if (adoption.petId) {
      const pet = await petRepo().findOneBy({ id: adoption.petId });
      if (pet) {
        adoption.compatibilityScore = calculateCompatibility(adoption, pet).score;
      }
    }

    await adoptionRepo.save(adoption);
  } catch (e) {
    console.warn("No se pudo guardar registro de adoption:", e);
  }

  const updated = await userRepo().save({ ...user, adopter: true });

  res.status(201).json(publicUser(updated));
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

  const merged = await userRepo().save({ ...user, ...updates });
  res.json(publicUser(merged));
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
  const [totalAll, admins, adopters, comunes] = await Promise.all([
    userRepo().count(),
    userRepo().count({ where: { roleId: CatalogIds.userRole.admin } }),
    userRepo().count({ where: { adopter: true } }),
    // "Comunes" = usuario común que todavía no es adoptante.
    userRepo().count({
      where: { roleId: CatalogIds.userRole.user, adopter: false },
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
