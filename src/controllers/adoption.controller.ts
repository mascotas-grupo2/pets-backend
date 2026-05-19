import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Adoption } from "../entity/Adoption.js";
import { adoptionSchema, AdoptionInput } from "../schemas/adoption.schema.js";

function adoptionRepo() {
  return AppDataSource.getRepository(Adoption);
}

export async function createAdoption(req: Request, res: Response) {
  const parsed = adoptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const values: AdoptionInput = parsed.data;
  const userIdFromReq = req.authUser?.id;
  const adoption = adoptionRepo().create({
    userId: userIdFromReq ?? values.userId ?? null,
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

  const saved = await adoptionRepo().save(adoption);
  res.status(201).json(saved);
}

export async function listAdoptions(req: Request, res: Response) {
  const repo = adoptionRepo();
  // If user is admin, return all; otherwise, return only user's adoptions
  const isAdmin = req.authUser?.role === "admin";
  if (isAdmin) {
    const all = await repo.find({ order: { createdAt: "DESC" } });
    return res.json(all);
  }
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "Usuario no autenticado" });
  const items = await repo.find({ where: { userId }, order: { createdAt: "DESC" } });
  res.json(items);
}
