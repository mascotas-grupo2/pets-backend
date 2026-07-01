import { Request, Response } from "express";
import { dbManager } from "../lib/db-context.js";
import { Sighting } from "../entity/Sighting.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import { notify } from "../lib/notify.js";

function sightingRepo() {
  return dbManager().getRepository(Sighting);
}
function petRepo() {
  return dbManager().getRepository(Pet);
}
function userRepo() {
  return dbManager().getRepository(User);
}

/**
 * Admins que deben enterarse de lo que pasa con una mascota: los del refugio
 * dueño de la publicación. Si la mascota no tiene refugio asignado (o ninguno
 * matchea), se avisa a todos los admins como fallback.
 */
async function adminsForPet(pet: Pet): Promise<User[]> {
  const admins = await userRepo().find({
    where: { roleId: CatalogIds.userRole.admin },
  });
  if (pet.refugioId != null) {
    const delRefugio = admins.filter((a) => a.refugioId === pet.refugioId);
    if (delRefugio.length) return delRefugio;
  }
  return admins;
}

/** Reporta un avistamiento ("La vi") y notifica al dueño y al refugio. Anónimo o logueado. */
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

  const toCoord = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const latitud = toCoord(req.body?.latitud);
  const longitud = toCoord(req.body?.longitud);

  if (!place && !note) {
    return res.status(400).json({ error: "Contanos dónde la viste o algún detalle." });
  }

  const saved = await sightingRepo().save(
    sightingRepo().create({
      petId,
      reporterUserId: req.authUser?.id ?? null,
      place,
      latitud,
      longitud,
      sightedOn,
      note,
      contact,
    }),
  );

  const petName = pet.name ?? "la mascota";

  // Aviso al dueño de la publicación (si está registrado).
  await notify(pet.userId, {
    type: "avistamiento",
    title: `Posible avistamiento de ${petName}`,
    body: place ? `Vista en ${place}` : "Alguien dejó información",
    link: `/mascotas-perdidas/${petId}`,
  });

  // Aviso a los admins del refugio: best-effort, no debe tumbar la operación.
  try {
    const admins = await adminsForPet(pet);
    for (const admin of admins) {
      if (admin.id === pet.userId) continue; // ya avisado como dueño
      await notify(admin.id, {
        type: "avistamiento",
        title: `Nuevo avistamiento de ${petName}`,
        body: place ? `Reportado en ${place}` : "Alguien dejó una pista",
        link: `/mascotas-perdidas/${petId}`,
      });
    }
  } catch (e) {
    console.warn("[sighting] no se pudo avisar a los admins:", (e as Error).message);
  }

  res.status(201).json(saved);
}

/** Lista los avistamientos de una mascota (dueño o admin). */
export async function listSightings(req: Request, res: Response) {
  const petId = req.params.id;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });
  const authUser = req.authUser;
  const isOwnerOrAdmin =
    authUser &&
    (authUser.role === "admin" ||
      authUser.role === "superadmin" ||
      authUser.id === pet.userId ||
      authUser.id === pet.ownerUserId);
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "No autorizado" });

  const items = await sightingRepo().find({
    where: { petId },
    order: { createdAt: "DESC" },
  });
  res.json(items);
}

/** Acepta ("confirma") un avistamiento. Lo puede hacer el dueño o un admin. */
export async function acceptSighting(req: Request, res: Response) {
  const { id: petId, sightingId } = req.params;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const authUser = req.authUser;
  const isOwnerOrAdmin =
    authUser &&
    (authUser.role === "admin" ||
      authUser.role === "superadmin" ||
      authUser.id === pet.userId ||
      authUser.id === pet.ownerUserId);
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "No autorizado" });

  const sighting = await sightingRepo().findOneBy({ id: sightingId, petId });
  if (!sighting) return res.status(404).json({ error: "Avistamiento no encontrado" });

  if (!sighting.accepted) {
    sighting.accepted = true;
    sighting.acceptedAt = new Date();
    sighting.acceptedByUserId = authUser?.id ?? null;
    // Aceptar deja sin efecto un rechazo previo.
    sighting.rejected = false;
    sighting.rejectedAt = null;
    sighting.rejectedByUserId = null;
    await sightingRepo().save(sighting);

    // Avisar a quien reportó el avistamiento (si está registrado).
    await notify(sighting.reporterUserId, {
      type: "avistamiento",
      title: `Confirmaron tu avistamiento de ${pet.name ?? "la mascota"}`,
      body: "¡Gracias! Tu pista fue tomada en cuenta por el refugio.",
      link: `/mascotas-perdidas/${petId}`,
    });
  }

  res.json(sighting);
}

/** Descarta ("rechaza") un avistamiento. Lo puede hacer el dueño o un admin. */
export async function rejectSighting(req: Request, res: Response) {
  const { id: petId, sightingId } = req.params;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const authUser = req.authUser;
  const isOwnerOrAdmin =
    authUser &&
    (authUser.role === "admin" ||
      authUser.role === "superadmin" ||
      authUser.id === pet.userId ||
      authUser.id === pet.ownerUserId);
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "No autorizado" });

  const sighting = await sightingRepo().findOneBy({ id: sightingId, petId });
  if (!sighting) return res.status(404).json({ error: "Avistamiento no encontrado" });

  if (!sighting.rejected) {
    sighting.rejected = true;
    sighting.rejectedAt = new Date();
    sighting.rejectedByUserId = authUser?.id ?? null;
    // Rechazar deja sin efecto una aceptación previa.
    sighting.accepted = false;
    sighting.acceptedAt = null;
    sighting.acceptedByUserId = null;
    await sightingRepo().save(sighting);
  }

  res.json(sighting);
}
