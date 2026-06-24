import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Sighting } from "../entity/Sighting.js";
import { Pet } from "../entity/Pet.js";
import { notify } from "../lib/notify.js";

function sightingRepo() {
  return dbManager().getRepository(Sighting);
}
function petRepo() {
  return dbManager().getRepository(Pet);
}

/** Reporta un avistamiento ("La vi") y notifica al dueño. Anónimo o logueado. */
export async function createSighting(req: Request, res: Response) {
  const petId = req.params.id;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const place = typeof req.body?.place === "string" ? req.body.place.trim().slice(0, 200) : null;
  const sightedOn =
    typeof req.body?.sightedOn === "string" ? req.body.sightedOn.trim().slice(0, 40) : null;
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : null;
  const contact =
    typeof req.body?.contact === "string" ? req.body.contact.trim().slice(0, 200) : null;

  if (!place && !note) {
    return res.status(400).json({ error: "Contanos dónde la viste o algún detalle." });
  }

  const saved = await sightingRepo().save(
    sightingRepo().create({
      petId,
      reporterUserId: req.authUser?.id ?? null,
      place,
      sightedOn,
      note,
      contact,
    }),
  );

  await notify(pet.userId, {
    type: "avistamiento",
    title: `Posible avistamiento de ${pet.name ?? "tu mascota"}`,
    body: place ? `Vista en ${place}` : "Alguien dejó información",
    link: `/mascotas-perdidas/${petId}`,
  });

  res.status(201).json(saved);
}

/** Lista los avistamientos de una mascota (dueño o admin). */
export async function listSightings(req: Request, res: Response) {
  const petId = req.params.id;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });
  const authUser = req.authUser;
  const isOwnerOrAdmin =
    authUser && (authUser.role === "admin" || authUser.id === pet.userId);
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "No autorizado" });

  const items = await sightingRepo().find({
    where: { petId },
    order: { createdAt: "DESC" },
  });
  res.json(items);
}
