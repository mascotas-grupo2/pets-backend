import { AppDataSource } from "../data-source.js";
import { Notification } from "../entity/Notification.js";

export type NotificationType = "message" | "adoption_status" | "publication";

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
    await repo.save(
      repo.create({
        userId: userId as number,
        type: data.type,
        title: data.title.slice(0, 160),
        body: data.body ? data.body.slice(0, 2000) : null,
        link: data.link ?? null,
      }),
    );
  } catch (e) {
    console.warn("[notify] no se pudo crear la notificación:", (e as Error).message);
  }
}
