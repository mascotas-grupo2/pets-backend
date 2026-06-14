import { AppDataSource } from "../data-source.js";
import { Notification } from "../entity/Notification.js";
import { emitToUser } from "./realtime.js";

export type NotificationType =
  | "message"
  | "adoption_status"
  | "publication"
  | "comment"
  | "avistamiento";

/**
 * Crea una notificación in-app para un usuario. Es best-effort: si falla no
 * lanza (no debe tumbar la operación principal que la dispara).
 */
export async function notify(
  userId: number | null | undefined,
  data: {
    type: NotificationType;
    title: string;
    body?: string | null;
    link?: string | null;
  },
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
