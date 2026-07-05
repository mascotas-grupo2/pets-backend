import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Followup } from "../entity/Followup.js";
import { Pet } from "../entity/Pet.js";
import { User } from "../entity/User.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import { FollowupCreateInput, followupCreateSchema, followupListQuerySchema, FollowupUpdateInput, followupUpdateSchema } from "../schemas/followup.schema.js";
import { getCatalogValuesById } from "../lib/catalog-values.js";
import { recordActivity } from "../lib/activity.js";
import { notify } from "../lib/notify.js";
import { parseOptionalInt } from "../controllers/_shared_parsers.js";
import { applyTenantScope } from "../lib/tenant.js";

function repo() {
  return dbManager().getRepository(Followup);
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** ¿La fecha cae en el día de hoy (hora local del server)? */
function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * Si el seguimiento es para hoy, notifica a los admins del refugio (incluido el
 * que lo agendó) con un recordatorio de agenda del día. Best-effort.
 */
async function notifyTodayReminder(followup: Followup, refugioId: number | null) {
  try {
    const when = new Date(followup.appointmentAt);
    if (Number.isNaN(when.getTime()) || !isToday(when)) return;

    const pet = await dbManager()
      .getRepository(Pet)
      .findOneBy({ id: followup.petId });
    const petName = pet?.name ?? "una mascota";
    const hora = when.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const admins = await dbManager().getRepository(User).find({
      where:
        refugioId != null
          ? { roleId: CatalogIds.userRole.admin, refugioId }
          : { roleId: CatalogIds.userRole.admin },
    });
    for (const admin of admins) {
      await notify(admin.id, {
        type: "adoption_status",
        title: "📅 Seguimiento para hoy",
        body: `Tenés un seguimiento agendado para hoy a las ${hora} (${petName}).`,
        link: "/admin/seguimientos",
      });
    }
  } catch (e) {
    console.warn(
      "[followup] no se pudo enviar recordatorio de hoy:",
      (e as Error).message,
    );
  }
}

/**
 * Pone la mascota "En tratamiento médico" (petStatus.medico) cuando se aprueba un
 * seguimiento médico. Solo si viene de una etapa previa a la adopción (perdido /
 * en refugio / en tránsito); si ya está en tratamiento o en una etapa posterior
 * (adopción / adoptado / devuelta), no hace nada. Best-effort. Deja nota y avisa.
 */
async function promotePetToMedico(petId: string, actorId: number | null) {
  try {
    const S = CatalogIds.petStatus;
    const ORIGENES_VALIDOS: number[] = [S.perdido, S.transito];

    const petRepo = dbManager().getRepository(Pet);
    const pet = await petRepo.findOneBy({ id: petId });
    if (!pet) return;
    if (pet.statusId === S.medico) return; // ya está en tratamiento
    if (!ORIGENES_VALIDOS.includes(pet.statusId)) return; // no regresar desde adopción/terminal

    pet.statusId = S.medico;
    await petRepo.save(pet);

    await recordActivity({
      type: "seguimiento",
      title: `${pet.name ?? "Una mascota"} pasó a tratamiento médico`,
      actorUserId: actorId,
      refugioId: pet.refugioId ?? null,
      refType: "pet",
      refId: pet.id,
      link: "/admin/mascotas",
    });

    if (pet.userId) {
      await notify(pet.userId, {
        type: "publication",
        title: `🏥 ${pet.name ?? "Tu mascota"} está en tratamiento médico`,
        body: "El refugio confirmó un seguimiento médico y la mascota pasó a tratamiento.",
        link: `/mascotas-perdidas/${pet.id}`,
      });
    }
  } catch (e) {
    console.warn(
      "[followup] no se pudo poner la mascota en tratamiento médico:",
      (e as Error).message,
    );
  }
}

export async function createFollowup(req: Request, res: Response) {
  const parsed = followupCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const values: FollowupCreateInput = parsed.data;
  const followup = repo().create({
    petId: values.petId,
    userId: values.userId,
    typeId: values.typeId,
    statusId: CatalogIds.followupStatus.pendiente,
    appointmentAt: values.appointmentAt,
    refugioId: req.authUser?.refugioId ?? null,
  });
  const saved = await repo().save(followup);
  const catalogValuesById = await getCatalogValuesById();
  const tipoLabel = catalogValuesById.get(saved.typeId)?.label ?? "Seguimiento";

  await recordActivity({
    type: "seguimiento",
    title: "Nuevo seguimiento agendado",
    actorUserId: req.authUser?.id ?? null,
    refugioId: req.authUser?.refugioId ?? null,
    refType: "followup",
    refId: saved.id,
    link: "/admin/seguimientos",
  });

  // Avisar al RESPONSABLE del seguimiento. OJO: `values.userId` es el responsable
  // elegido en el alta (staff / veterinario / adoptante, según el caso), NO
  // necesariamente el adoptante. Por eso el texto es contextual al TIPO y no
  // asume "post-adopción". El seguimiento post-adopción es solo uno de los tipos.
  const esPostAdopcion = saved.typeId === CatalogIds.followupType.postAdopcion;
  await notify(values.userId, {
    type: "adoption_status",
    title: esPostAdopcion
      ? "Se agendó un seguimiento post-adopción"
      : `Se te asignó un seguimiento: ${tipoLabel}`,
    body: esPostAdopcion
      ? "Un administrador programó un seguimiento para tu adopción."
      : `Un administrador te asignó como responsable de un seguimiento (${tipoLabel}).`,
    link: "/account",
  });

  // Si el seguimiento es para HOY, avisar a los admins del refugio (incluido quien
  // lo agenda) con un recordatorio de agenda del día. `recordActivity` ya notifica
  // a los OTROS admins del alta, pero excluye al actor: este aviso "de hoy" sí le
  // llega al que lo creó, porque es un recordatorio de su agenda inmediata.
  await notifyTodayReminder(saved, req.authUser?.refugioId ?? null);

  res.status(201).json({ ...saved, type: catalogValuesById.get(saved.typeId) ?? null, status: catalogValuesById.get(saved.statusId) ?? null });
}

export async function listFollowups(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  const parsed = followupListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const filters = parsed.data;

  const qb = repo().createQueryBuilder("f");
  applyTenantScope(qb, "f", req.authUser);
  if (filters.petId) qb.andWhere("f.petId = :petId", { petId: filters.petId });
  if (filters.userId) qb.andWhere("f.userId = :userId", { userId: filters.userId });
  if (filters.typeId) qb.andWhere("f.typeId = :typeId", { typeId: filters.typeId });
  if (filters.statusId) qb.andWhere("f.statusId = :statusId", { statusId: filters.statusId });
  if (filters.dateFrom) qb.andWhere("f.appointmentAt >= :dateFrom", { dateFrom: filters.dateFrom });
  if (filters.dateTo) qb.andWhere("f.appointmentAt <= :dateTo", { dateTo: filters.dateTo });

  const orderByField = filters.orderBy ? `f.${filters.orderBy}` : "f.appointmentAt";
  const orderDirection = filters.orderDir ? (filters.orderDir.toUpperCase() as "ASC" | "DESC") : "DESC";

  const [items, total] = await qb.orderBy(orderByField, orderDirection).skip(skip).take(pageSize).getManyAndCount();
  const catalogValuesById = await getCatalogValuesById();
  res.json({ page, pageSize, total, items: items.map((i) => ({ ...i, type: catalogValuesById.get(i.typeId) ?? null, status: catalogValuesById.get(i.statusId) ?? null })) });
}

export async function confirmFollowup(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });

  if (item.statusId !== CatalogIds.followupStatus.pendiente) {
    return res
      .status(409)
      .json({ error: "Solo se puede confirmar un seguimiento pendiente." });
  }
  item.statusId = CatalogIds.followupStatus.confirmado;
  await repo().save(item);

  // Regla de negocio: al APROBAR (confirmar) un seguimiento MÉDICO, la mascota
  // pasa a "En tratamiento médico" si está en una etapa previa a la adopción.
  if (item.typeId === CatalogIds.followupType.medico) {
    await promotePetToMedico(item.petId, req.authUser?.id ?? null);
  }

  res.json(item);
}

export async function completeFollowup(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });

  if (item.statusId === CatalogIds.followupStatus.completado) {
    return res.status(409).json({ error: "El seguimiento ya está completado." });
  }
  item.statusId = CatalogIds.followupStatus.completado;
  await repo().save(item);
  res.json(item);
}

export async function getFollowupById(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });

  const catalogValuesById = await getCatalogValuesById();
  res.json({
    ...item,
    type: catalogValuesById.get(item.typeId) ?? null,
    status: catalogValuesById.get(item.statusId) ?? null,
  });
}

export async function updateFollowup(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const parsed = followupUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });

  const values: FollowupUpdateInput = parsed.data;

  const validStatusIds = Object.values(CatalogIds.followupStatus) as number[];
  const validTypeIds = Object.values(CatalogIds.followupType) as number[];
  if (values.statusId !== undefined && !validStatusIds.includes(values.statusId)) {
    return res.status(400).json({ error: "Estado de seguimiento inválido." });
  }
  if (values.typeId !== undefined && !validTypeIds.includes(values.typeId)) {
    return res.status(400).json({ error: "Tipo de seguimiento inválido." });
  }

  if (values.petId !== undefined) item.petId = values.petId;
  if (values.userId !== undefined) item.userId = values.userId;
  if (values.typeId !== undefined) item.typeId = values.typeId;
  if (values.appointmentAt !== undefined) item.appointmentAt = values.appointmentAt;
  if (values.statusId !== undefined) item.statusId = values.statusId;

  const saved = await repo().save(item);
  const catalogValuesById = await getCatalogValuesById();
  res.json({
    ...saved,
    type: catalogValuesById.get(saved.typeId) ?? null,
    status: catalogValuesById.get(saved.statusId) ?? null,
  });
}

export async function deleteFollowup(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });

  await repo().remove(item);
  res.json({ success: true });
}
