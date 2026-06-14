import { Router } from "express";
import {
  listComments,
  commentCounts,
  createComment,
  approveComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import { optionalAuth, requireAuth } from "../lib/auth.js";

export const commentRouter = Router();

// Rutas para el comentario en /api/mascotas/:petId/comments (usadas por el frontend)
// Listar comentarios de una publicación (público ve solo aprobados, owner/admin ve todos)
commentRouter.get("/:petId", optionalAuth, listComments);

// Ruta admin: lista comentarios pendientes + aprobados para el owner
commentRouter.get("/:petId/admin", optionalAuth, listComments);

// Conteo de comentarios totales/pendientes para badges (solo owner/admin)
commentRouter.get("/:petId/counts", requireAuth, commentCounts);

// Crear un comentario (requiere auth) — el petId viene en la URL
commentRouter.post("/:petId", requireAuth, createComment);

// Aprobar un comentario (solo owner de la publicación o admin)
commentRouter.post("/:petId/:id/approve", requireAuth, approveComment);

// Rechazar un comentario (solo owner de la publicación o admin)
commentRouter.post("/:petId/:id/reject", requireAuth, async (req, res) => {
  // Rechazar es lo mismo que aprobar con approved=false, forzamos req.body.approved = false
  req.body = { ...req.body, approved: false };
  await approveComment(req, res);
});

// Eliminar un comentario (autor, owner de la publicación o admin)
commentRouter.delete("/:id", requireAuth, deleteComment);
