import { Request, Response } from "express";
import { ILike } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { User, UserRole } from "../entity/User.js";
import { uploadFileToMinio } from "../lib/minio.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";
import { Adoption } from "../entity/Adoption.js";

const adminUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

const adminListQuerySchema = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  role: z.nativeEnum(UserRole).optional(),
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

  return {
    ...safe,
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

  res.json({
    reports: reports.map((pet) => ({ id: pet.id, title: pet.name ?? pet.animalType, description: pet.description, status: "perdido", created_at: pet.createdAt.toISOString() })),
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
    hasGarden: latest?.hasGarden ?? null,
    livingSituation: latest?.livingSituation ?? null,
    householdSetting: latest?.householdSetting ?? null,
    activityLevel: latest?.activityLevel ?? null,
    adults: latest?.adults ?? null,
    children: latest?.children ?? null,
    visitingChildren: latest?.visitingChildren ?? null,
    hasFlatmates: latest?.hasFlatmates ?? null,
    allergies: latest?.allergies ?? null,
    otherAnimals: latest?.otherAnimals ?? null,
    otherAnimalsDetail: latest?.otherAnimalsDetail ?? null,
    neutered: latest?.neutered ?? null,
    vaccinated: latest?.vaccinated ?? null,
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

  // store adoption record
  try {
    const adoptionRepo = AppDataSource.getRepository(Adoption);
    const adoption = adoptionRepo.create({
      userId: id,
      petId: values.petId ?? null,
      preferredAnimal: values.preferredAnimal || null,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      addressLine1: values.addressLine1,
      addressLine2: values.addressLine2 || null,
      postcode: values.postcode,
      town: values.town,
      hasGarden: values.hasGarden,
      livingSituation: values.livingSituation || null,
      householdSetting: values.householdSetting || null,
      activityLevel: values.activityLevel || null,
      adults: values.adults,
      children: values.children,
      visitingChildren: values.visitingChildren,
      hasFlatmates: values.hasFlatmates,
      allergies: values.allergies || null,
      otherAnimals: values.otherAnimals,
      otherAnimalsDetail: values.otherAnimalsDetail || null,
      neutered: values.neutered,
      vaccinated: values.vaccinated,
      experience: values.experience || null,
      acceptsTerms: values.acceptsTerms,
    });
    await adoptionRepo.save(adoption);
  } catch (e) {
    console.warn("No se pudo guardar registro de adoption:", e);
  }

  // mark user as adopter
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

export async function adminListUsers(req: Request, res: Response) {
  const parsed = adminListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { search, role, page, pageSize } = parsed.data;

  const where = [] as Record<string, unknown>[];
  if (search) {
    const like = ILike(`%${search}%`);
    where.push({ email: like });
    where.push({ name: like });
  }
  const baseWhere = role ? { role } : {};
  const finalWhere =
    where.length > 0
      ? where.map((w) => ({ ...baseWhere, ...w }))
      : baseWhere;

  const [users, total] = await userRepo().findAndCount({
    where: finalWhere as any,
    order: { id: "ASC" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  res.json({
    page,
    pageSize,
    total,
    items: users.map((u) => {
      const safe = publicUser(u);
      return {
        id: safe.id,
        name: safe.name,
        email: safe.email,
        role: safe.role,
        adopter: safe.adopter,
        emailVerified: safe.emailVerified,
        ssoProvider: safe.ssoProvider,
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
  const { role: newRole } = parsed.data;

  const target = await userRepo().findOneBy({ id: targetId });
  if (!target) return res.status(404).json({ error: "Usuario no encontrado" });

  if (target.role === newRole) {
    return res.json(publicUser(target));
  }

  // No permitir auto-degradación: un admin no puede quitarse el rol a sí mismo.
  if (
    req.authUser?.id === target.id &&
    target.role === UserRole.ADMIN &&
    newRole !== UserRole.ADMIN
  ) {
    return res
      .status(400)
      .json({ error: "No podés quitarte el rol de admin a vos mismo" });
  }

  // No permitir dejar al sistema sin admins.
  if (target.role === UserRole.ADMIN && newRole !== UserRole.ADMIN) {
    const adminCount = await userRepo().count({
      where: { role: UserRole.ADMIN },
    });
    if (adminCount <= 1) {
      return res
        .status(400)
        .json({ error: "No podés dejar al sistema sin administradores" });
    }
  }

  target.role = newRole;
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

  const bucket = process.env.MINIO_PROFILE_BUCKET ?? process.env.MINIO_BUCKET ?? "profile";
  try {
    const url = await uploadFileToMinio(bucket, "profile", file.originalname, file.buffer, file.mimetype);
    const merged = await userRepo().save({ ...user, photo: url });
    res.json(publicUser(merged));
  } catch (e: any) {
    console.warn("Error subiendo foto de perfil:", e);
    if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Archivo demasiado grande" });
    res.status(500).json({ error: "No se pudo subir la foto" });
  }
}
