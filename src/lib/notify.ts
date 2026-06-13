import { AppDataSource } from "../data-source.js";
import { Notification } from "../entity/Notification.js";

/**
 * Crea una notificación in-app para un usuario.
 * @param userId - ID del usuario destinatario
 * @param type - Tipo de notificación: "message" | "adoption_status" | "publication" | "comment"
 * @param title - Título corto de la notificación
 * @param body - Texto descriptivo (opcional)
 * @param link - Ruta del front a la que lleva (opcional)
 */
export async function createNotification(
  userId: number,
  type: string,
  title: string,
  body?: string | null,
  link?: string | null,
) {
  const repo = AppDataSource.getRepository(Notification);
  const notif = repo.create({ userId, type, title, body: body ?? null, link: link ?? null });
  return repo.save(notif);
}

/**
 * Wrapper para crear notificaciones con un objeto de opciones.
 * Usado por los controllers existentes (mascotas, etc.).
 */
export async function notify(
  userId: number | null,
  opts: { type: string; title: string; body?: string | null; link?: string | null },
) {
  if (!Number.isInteger(userId)) return;
  return createNotification(userId!, opts.type, opts.title, opts.body, opts.link);
}
