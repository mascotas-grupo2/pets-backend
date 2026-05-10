import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";

function userRepo() {
  return AppDataSource.getRepository(User);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

function yesNoToBoolean(value: "si" | "no" | "") {
  if (value === "si") return true;
  if (value === "no") return false;
  return null;
}

function yesNoNAToBoolean(value: "si" | "no" | "na" | "") {
  if (value === "si") return true;
  if (value === "no") return false;
  return null;
}

function splitName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return {
    firstName: firstName || name,
    lastName: rest.join(" ") || "",
  };
}

export function publicUser(user: User) {
  const { passwordHash, passwordSalt, ...safe } = user as User & {
    passwordHash?: string;
    passwordSalt?: string;
  };

  return {
    ...safe,
    firstName: safe.firstName ?? splitName(safe.name).firstName,
    lastName: safe.lastName ?? splitName(safe.name).lastName,
  };
}

export async function getCommonInfo(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  res.json(publicUser(user));
}

export async function getMe(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const safe = publicUser(user);
  res.json({
    id: safe.id,
    userId: String(user.id),
    name: safe.name,
    firstName: safe.firstName,
    lastName: safe.lastName,
    email: safe.email,
    photo: safe.photo,
    role: safe.role,
    emailVerified: safe.emailVerified,
    ssoProvider: safe.ssoProvider,
  });
}

export async function getUserDetails(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const reports = await petRepo().find({
    where: { userId: id },
    order: { createdAt: "DESC" },
  });

  const safe = publicUser(user);
  res.json({
    userId: String(user.id),
    reports: reports.map((pet) => ({
      id: pet.id,
      title: pet.name ?? pet.animalType,
      description: pet.description,
      status: "perdido",
      created_at: pet.createdAt.toISOString(),
    })),
    photo: safe.photo,
    email: safe.email,
    messages: [],
    notifications: [],
    created_at: user.createdAt.toISOString(),
    addressLine1: safe.addressLine1,
    addressLine2: safe.addressLine2,
    firstName: safe.firstName,
    lastName: safe.lastName,
    phone: safe.phone,
    postcode: safe.postcode,
    town: safe.town,
    hasGarden: safe.hasGarden,
    livingSituation: safe.livingSituation,
    householdSetting: safe.householdSetting,
    activityLevel: safe.activityLevel,
    adults: safe.adults,
    children: safe.children,
    visitingChildren: safe.visitingChildren,
    hasFlatmates: safe.hasFlatmates,
    allergies: safe.allergies,
    otherAnimals: safe.otherAnimals,
    otherAnimalsDetail: safe.otherAnimalsDetail,
    neutered: safe.neutered,
    vaccinated: safe.vaccinated,
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

  const updated = await userRepo().save({
    ...user,
    adopter: true,
    preferredAnimal: values.preferredAnimal || null,
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone,
    addressLine1: values.addressLine1,
    addressLine2: values.addressLine2 || null,
    postcode: values.postcode,
    town: values.town,
    hasGarden: yesNoToBoolean(values.hasGarden),
    livingSituation: values.livingSituation || null,
    householdSetting: values.householdSetting || null,
    activityLevel: values.activityLevel || null,
    adults: values.adults,
    children: values.children,
    visitingChildren: yesNoToBoolean(values.visitingChildren),
    hasFlatmates: yesNoToBoolean(values.hasFlatmates),
    allergies: values.allergies || null,
    otherAnimals: yesNoToBoolean(values.otherAnimals),
    otherAnimalsDetail: values.otherAnimalsDetail || null,
    neutered: yesNoNAToBoolean(values.neutered),
    vaccinated: yesNoNAToBoolean(values.vaccinated),
    experience: values.experience || null,
  });

  res.status(201).json(publicUser(updated));
}

export async function updateUser(req: Request, res: Response) {
  const id = req.authUser?.id;
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const user = await userRepo().findOneBy({ id });
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

  const body = req.body || {};

  function parseBoolField(val: any) {
    if (val === "si") return true;
    if (val === "no") return false;
    if (val === "na") return null;
    if (val === null) return null;
    if (typeof val === "boolean") return val;
    return null;
  }

  const updates: Partial<User> = {};

  const allowedStringFields = [
    "firstName",
    "lastName",
    "phone",
    "addressLine1",
    "addressLine2",
    "postcode",
    "town",
    "livingSituation",
    "householdSetting",
    "activityLevel",
    "allergies",
    "otherAnimalsDetail",
    "experience",
    "preferredAnimal",
    "photo",
  ];

  for (const key of allowedStringFields) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      // @ts-ignore
      updates[key] = body[key] === "" ? null : body[key];
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "adults")) {
    const v = Number(body.adults);
    updates.adults = Number.isFinite(v) ? v : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "children")) {
    const v = Number(body.children);
    updates.children = Number.isFinite(v) ? v : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "hasGarden")) {
    updates.hasGarden = parseBoolField(body.hasGarden);
  }
  if (Object.prototype.hasOwnProperty.call(body, "visitingChildren")) {
    updates.visitingChildren = parseBoolField(body.visitingChildren);
  }
  if (Object.prototype.hasOwnProperty.call(body, "hasFlatmates")) {
    updates.hasFlatmates = parseBoolField(body.hasFlatmates);
  }
  if (Object.prototype.hasOwnProperty.call(body, "otherAnimals")) {
    updates.otherAnimals = parseBoolField(body.otherAnimals);
  }
  if (Object.prototype.hasOwnProperty.call(body, "neutered")) {
    updates.neutered = parseBoolField(body.neutered);
  }
  if (Object.prototype.hasOwnProperty.call(body, "vaccinated")) {
    updates.vaccinated = parseBoolField(body.vaccinated);
  }

  // Prevent changing role, passwordHash, passwordSalt or id
  const merged = await userRepo().save({ ...user, ...updates });

  res.json(publicUser(merged));
}
