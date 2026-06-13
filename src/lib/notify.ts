import { AppDataSource } from "../data-source.js";
import { Notification } from "../entity/Notification.js";
import { emitToUser } from "./realtime.js";

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
  try {
    const repo = AppDataSource.getRepository(Notification);
    const saved = await repo.save(
      repo.create({
        userId: userId as number,
        type: data.type,
        title: data.title.slice(0, 160),
        body: data.body ? data.body.slice(0, 2000) : null,
        link: data.link ?? null,
      }),
    );
    // Push en tiempo real a las pestañas del usuario (si tiene el socket abierto).
    emitToUser(userId, "notification:new", {
      id: saved.id,
      type: saved.type,
      title: saved.title,
      body: saved.body,
      link: saved.link,
      read: saved.read,
      createdAt: saved.createdAt,
    });
  } catch (e) {
    console.warn("[notify] no se pudo crear la notificación:", (e as Error).message);
  }
}
