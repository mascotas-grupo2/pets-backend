import { AppDataSource } from "../data-source.js";
import { dbManager } from "./db-context.js";
import { Activity, ActivityType } from "../entity/Activity.js";

/**
 * Registra una actividad en la tabla `activity` (para métricas + dashboard).
 * Es best-effort: si falla, no rompe la operación que la disparó.
 */
export async function recordActivity(data: {
  type: ActivityType;
  title: string;
  actorUserId?: number | null;
  refugioId?: number | null;
  refType?: string | null;
  refId?: string | number | null;
  link?: string | null;
}) {
  try {
    const repo = dbManager().getRepository(Activity);
    await repo.save(
      repo.create({
        type: data.type,
        title: data.title.slice(0, 200),
        actorUserId: data.actorUserId ?? null,
        refugioId: data.refugioId ?? null,
        refType: data.refType ?? null,
        refId: data.refId != null ? String(data.refId) : null,
        link: data.link ?? null,
      }),
    );
  } catch (e) {
    console.warn("[activity] no se pudo registrar:", (e as Error).message);
  }
}
