import { AppDataSource } from "../data-source.js";
import { Activity, ActivityType } from "../entity/Activity.js";
import { User } from "../entity/User.js";
import { CatalogIds } from "./catalog-constants.js";
import { notify, type NotificationType } from "./notify.js";

// Mapea el tipo de actividad al tipo de notificación (para el ícono del front).
const ACTIVITY_NOTIF_TYPE: Record<ActivityType, NotificationType> = {
  publicacion: "publication",
  comentario: "comment",
  mensaje: "message",
  solicitud: "adoption_status",
  seguimiento: "adoption_status",
  usuario_nuevo: "actividad",
  adoptante_nuevo: "actividad",
};

/**
 * Avisa a todos los admins de una actividad, salvo al admin que la generó (para
 * no auto-notificar sus propias acciones). Best-effort.
 */
async function notifyAdmins(data: {
  type: ActivityType;
  title: string;
  actorUserId?: number | null;
  link?: string | null;
}) {
  try {
    const admins = await AppDataSource.getRepository(User).find({
      where: { roleId: CatalogIds.userRole.admin },
    });
    for (const admin of admins) {
      if (admin.id === data.actorUserId) continue;
      await notify(admin.id, {
        type: ACTIVITY_NOTIF_TYPE[data.type] ?? "actividad",
        title: data.title,
        link: data.link ?? null,
      });
    }
  } catch (e) {
    console.warn("[activity] no se pudo notificar a admins:", (e as Error).message);
  }
}

/**
 * Registra una actividad en la tabla `activity` (para métricas + dashboard) y
 * notifica a los admins. Es best-effort: si falla, no rompe la operación que la
 * disparó.
 */
export async function recordActivity(data: {
  type: ActivityType;
  title: string;
  actorUserId?: number | null;
  refType?: string | null;
  refId?: string | number | null;
  link?: string | null;
}) {
  try {
    const repo = AppDataSource.getRepository(Activity);
    await repo.save(
      repo.create({
        type: data.type,
        title: data.title.slice(0, 200),
        actorUserId: data.actorUserId ?? null,
        refType: data.refType ?? null,
        refId: data.refId != null ? String(data.refId) : null,
        link: data.link ?? null,
      }),
    );
  } catch (e) {
    console.warn("[activity] no se pudo registrar:", (e as Error).message);
  }
  await notifyAdmins(data);
}
