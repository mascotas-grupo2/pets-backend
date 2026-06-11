import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Followup } from "../entity/Followup.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import { FollowupCreateInput, followupCreateSchema, followupListQuerySchema, FollowupUpdateInput, followupUpdateSchema } from "../schemas/followup.schema.js";
import { getCatalogValuesById } from "../lib/catalog-values.js";
import { parseOptionalInt } from "../controllers/_shared_parsers.js";

function repo() {
  return AppDataSource.getRepository(Followup);
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
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
  });
  const saved = await repo().save(followup);
  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json({ ...saved, type: catalogValuesById.get(saved.typeId) ?? null, status: catalogValuesById.get(saved.statusId) ?? null });
}

export async function listFollowups(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  const parsed = followupListQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const filters = parsed.data;

  const qb = repo().createQueryBuilder("f");
  if (filters.petId) qb.andWhere("f.petId = :petId", { petId: filters.petId });
  if (filters.userId) qb.andWhere("f.userId = :userId", { userId: filters.userId });
  if (filters.typeId) qb.andWhere("f.typeId = :typeId", { typeId: filters.typeId });
  if (filters.statusId) qb.andWhere("f.statusId = :statusId", { statusId: filters.statusId });
  if (filters.dateFrom) qb.andWhere("f.appointmentAt >= :dateFrom", { dateFrom: filters.dateFrom });
  if (filters.dateTo) qb.andWhere("f.appointmentAt <= :dateTo", { dateTo: filters.dateTo });

  const [items, total] = await qb.orderBy("f.appointmentAt", "DESC").skip(skip).take(pageSize).getManyAndCount();
  const catalogValuesById = await getCatalogValuesById();
  res.json({ page, pageSize, total, items: items.map((i) => ({ ...i, type: catalogValuesById.get(i.typeId) ?? null, status: catalogValuesById.get(i.statusId) ?? null })) });
}

export async function changeFollowupStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });
  const statusId = Number(req.body.statusId);
  if (!Number.isInteger(statusId)) return res.status(400).json({ error: "statusId invalido" });

  const item = await repo().findOneBy({ id });
  if (!item) return res.status(404).json({ error: "Seguimiento no encontrado" });
  item.statusId = statusId;
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
