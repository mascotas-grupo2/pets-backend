import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { PetComment } from "../entity/PetComment.js";
import { Pet } from "../entity/Pet.js";
import { notify } from "../lib/notify.js";
import { recordActivity } from "../lib/activity.js";

function commentRepo() {
  return AppDataSource.getRepository(PetComment);
}
function petRepo() {
  return AppDataSource.getRepository(Pet);
}

function serialize(c: PetComment) {
  return {
    id: c.id,
    petId: c.petId,
    authorName: c.authorName,
    authorEmail: c.authorEmail,
    text: c.text,
    status: c.status,
    createdAt: c.createdAt,
  };
}

async function isOwnerOrAdmin(
  petId: string,
  authUser?: { id: number; role?: string },
) {
  if (!authUser) return false;
  if (authUser.role === "admin") return true;
  const pet = await petRepo().findOneBy({ id: petId });
  return pet?.userId === authUser.id;
}

/** Comentarios aprobados (visibles para todos). */
export async function listApprovedComments(req: Request, res: Response) {
  const petId = req.params.id;
  const items = await commentRepo().find({
    where: { petId, status: "approved" },
    order: { createdAt: "DESC" },
  });
  res.json(items.map(serialize));
}

/** Todos los comentarios (pending + aprobados) para el dueño/admin a moderar. */
export async function listOwnerComments(req: Request, res: Response) {
  const petId = req.params.id;
  if (!(await isOwnerOrAdmin(petId, req.authUser))) {
    return res.status(403).json({ error: "No autorizado" });
  }
  const items = await commentRepo().find({
    where: { petId },
    order: { createdAt: "DESC" },
  });
  res.json(items.map(serialize));
}

/** Crear comentario (anónimo o logueado). Queda pending y notifica al dueño. */
export async function createComment(req: Request, res: Response) {
  const petId = req.params.id;
  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Pet no encontrada" });

  const authorName =
    typeof req.body?.authorName === "string" ? req.body.authorName.trim() : "";
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const authorEmail =
    typeof req.body?.authorEmail === "string" && req.body.authorEmail.trim()
      ? req.body.authorEmail.trim().slice(0, 200)
      : null;
  if (!authorName || !text) {
    return res.status(400).json({ error: "Nombre y comentario son obligatorios." });
  }

  const saved = await commentRepo().save(
    commentRepo().create({
      petId,
      authorName: authorName.slice(0, 120),
      text: text.slice(0, 2000),
      authorEmail,
      authorUserId: req.authUser?.id ?? null,
      status: "pending",
    }),
  );

  await recordActivity({
    type: "comentario",
    title: `Comentario en ${pet.name ?? "una publicación"}`,
    actorUserId: req.authUser?.id ?? null,
    refType: "comment",
    refId: saved.id,
    link: `/mascotas-perdidas/${petId}`,
  });

  // Avisar al dueño que tiene un comentario para moderar.
  await notify(pet.userId, {
    type: "comment",
    title: `Nuevo comentario en ${pet.name ?? "tu publicación"}`,
    body: `${authorName}: ${text.slice(0, 80)}`,
    link: `/mascotas-perdidas/${petId}`,
  });

  res.status(201).json(serialize(saved));
}

async function setStatus(req: Request, res: Response, status: "approved" | "rejected") {
  const petId = req.params.id;
  const commentId = req.params.commentId;
  if (!(await isOwnerOrAdmin(petId, req.authUser))) {
    return res.status(403).json({ error: "No autorizado" });
  }
  const c = await commentRepo().findOneBy({ id: commentId, petId });
  if (!c) return res.status(404).json({ error: "Comentario no encontrado" });
  c.status = status;
  const saved = await commentRepo().save(c);
  res.json(serialize(saved));
}

export function approveComment(req: Request, res: Response) {
  return setStatus(req, res, "approved");
}
export function rejectComment(req: Request, res: Response) {
  return setStatus(req, res, "rejected");
}
