import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Comment } from "../entity/Comment.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { COMMENT_SECTIONS } from "../schemas/comment.schema.js";
import { createNotification } from "../lib/notify.js";

function commentRepo() {
  return AppDataSource.getRepository(Comment);
}

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

function userRepo() {
  return AppDataSource.getRepository(User);
}

/** Serializa un comentario para la respuesta. */
function serializeComment(comment: Comment, userName: string | null) {
  return {
    id: comment.id,
    petId: comment.petId,
    userId: comment.userId,
    userName,
    section: comment.section,
    content: comment.content,
    approved: comment.approved,
    createdAt: comment.createdAt,
  };
}

/** Serializa un comentario con el formato que espera el frontend (authorName, authorEmail, status, text). */
function serializeForFrontend(comment: Comment, userName: string | null) {
  return {
    id: comment.id,
    petId: comment.petId,
    authorName: userName ?? "Usuario",
    authorEmail: null as string | null,
    text: comment.content,
    status: comment.approved ? "approved" : "pending",
    createdAt: comment.createdAt,
  };
}

/**
 * GET /api/comments/:petId
 * Devuelve los comentarios de una publicación.
 * - Público: solo ve comentarios aprobados.
 * - Owner de la publicación o admin: ve todos (pendientes + aprobados).
 *
 * Query params opcionales:
 *   ?section=salud       — filtra por sección
 *   ?approved=true|false — filtra por estado (solo owner/admin)
 */
export async function listComments(req: Request, res: Response) {
  const petId = req.params.petId;
  if (!petId) return res.status(400).json({ error: "Falta petId" });

  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Publicación no encontrada" });

  const isOwner = req.authUser && pet.userId === req.authUser.id;
  const isAdmin = req.authUser?.role === "admin";
  const canSeeAll = isOwner || isAdmin;

  const where: any = { petId };

  if (!canSeeAll) {
    where.approved = true;
  } else if (req.query.approved !== undefined) {
    // Filtro explícito solo para owner/admin
    where.approved = req.query.approved === "true";
  }

  // Filtro por sección
  if (typeof req.query.section === "string" && COMMENT_SECTIONS.includes(req.query.section as any)) {
    where.section = req.query.section;
  }

  const comments = await commentRepo().find({
    where,
    order: { createdAt: "DESC" },
  });

  // Resolver nombres de usuario
  const userIds = [...new Set(comments.map((c) => c.userId))];
  const users = userIds.length
    ? await userRepo().findBy(userIds.map((id) => ({ id })))
    : [];
  const userNames = new Map(users.map((u) => [u.id, u.name]));

  // Si la ruta incluye /comments (viene del frontend a través de mascotasRouter),
  // devolver en formato PetComment
  if (req.originalUrl.includes("/comments") || req.path.includes("/comments")) {
    return res.json(
      comments.map((c) =>
        serializeForFrontend(c, userNames.get(c.userId) ?? null)
      )
    );
  }

  res.json(
    comments.map((c) =>
      serializeComment(c, userNames.get(c.userId) ?? "Usuario")
    )
  );
}

/**
 * GET /api/comments/:petId/counts
 * Devuelve conteo total y de pendientes para mostrar badges.
 * Solo visible para el owner de la publicación o admin.
 */
export async function commentCounts(req: Request, res: Response) {
  const petId = req.params.petId;
  if (!petId) return res.status(400).json({ error: "Falta petId" });

  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) return res.status(404).json({ error: "Publicación no encontrada" });

  const isOwner = req.authUser && pet.userId === req.authUser.id;
  const isAdmin = req.authUser?.role === "admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "No autorizado" });
  }

  const [total, pending] = await Promise.all([
    commentRepo().countBy({ petId }),
    commentRepo().countBy({ petId, approved: false }),
  ]);

  res.json({ total, pending });
}

/**
 * POST /api/mascotas/:petId/comments
 * Crea un nuevo comentario (requiere autenticación).
 * El frontend envía: { authorName, text, authorEmail? }
 * El petId se obtiene de la URL.
 * El comentario queda pendiente de aprobación, a menos que sea del dueño.
 */
export async function createComment(req: Request, res: Response) {
  const petId = req.params.petId;
  if (!petId) return res.status(400).json({ error: "Falta petId" });

  const { authorName, text, authorEmail } = req.body;
  if (!authorName || !text) {
    return res.status(400).json({ error: "Falta authorName o text" });
  }

  const pet = await petRepo().findOneBy({ id: petId });
  if (!pet) {
    return res.status(404).json({ error: "Publicación no encontrada" });
  }

  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "Usuario no autenticado" });
  }

  // El dueño de la publicación se auto-aprueba
  const isOwner = pet.userId === userId;
  const comment = commentRepo().create({
    petId,
    userId,
    section: "general",
    content: text,
    approved: isOwner,
  });

  const saved = await commentRepo().save(comment);
  const user = await userRepo().findOneBy({ id: userId });

  res.status(201).json(
    serializeForFrontend(saved, user?.name ?? null)
  );
}

/**
 * POST /api/mascotas/:petId/comments/:id/approve o PUT /api/comments/:id/approve
 * Aprueba o rechaza un comentario.
 * Solo el dueño de la publicación o un admin pueden hacer esto.
 * Body: { approved: boolean }
 * Para el frontend, approve es un POST sin body (approved=true) y reject es POST sin body (approved=false).
 */
export async function approveComment(req: Request, res: Response) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Falta id del comentario" });

  // Si no viene approved en el body, determinar por la ruta
  let approved = req.body?.approved;
  if (typeof approved !== "boolean") {
    // Si la ruta contiene /reject, es un rechazo
    approved = !req.path.includes("/reject");
  }

  const comment = await commentRepo().findOneBy({ id });
  if (!comment) {
    return res.status(404).json({ error: "Comentario no encontrado" });
  }

  const pet = await petRepo().findOneBy({ id: comment.petId });
  if (!pet) {
    return res.status(404).json({ error: "Publicación no encontrada" });
  }

  const isOwner = req.authUser && pet.userId === req.authUser.id;
  const isAdmin = req.authUser?.role === "admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      error: "Solo el dueño de la publicación o un administrador puede aprobar comentarios",
    });
  }

  comment.approved = approved;
  const saved = await commentRepo().save(comment);
  const user = await userRepo().findOneBy({ id: saved.userId });

  // Si se aprobó el comentario, notificar al autor
  if (approved && saved.userId !== req.authUser?.id) {
    const petName = pet?.name ?? "tu publicación";
    createNotification(
      saved.userId,
      "comment",
      "Comentario aprobado",
      `Tu comentario en "${petName}" fue aprobado y ya es visible.`,
      `/mascotas-perdidas/${comment.petId}`,
    ).catch(() => {});
  }

  res.json(serializeComment(saved, user?.name ?? "Usuario"));
}

/**
 * DELETE /api/comments/:id
 * Elimina un comentario.
 * Solo el autor, el dueño de la publicación o un admin.
 */
export async function deleteComment(req: Request, res: Response) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "Falta id del comentario" });

  const comment = await commentRepo().findOneBy({ id });
  if (!comment) {
    return res.status(404).json({ error: "Comentario no encontrado" });
  }

  const pet = await petRepo().findOneBy({ id: comment.petId });

  const isAuthor = req.authUser && comment.userId === req.authUser.id;
  const isOwner = pet && req.authUser && pet.userId === req.authUser.id;
  const isAdmin = req.authUser?.role === "admin";

  if (!isAuthor && !isOwner && !isAdmin) {
    return res.status(403).json({
      error: "No autorizado para eliminar este comentario",
    });
  }

  await commentRepo().remove(comment);
  res.status(204).send();
}
