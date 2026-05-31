import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Followup } from "../entity/Followup.js";
import { FollowupCreateInput, followupCreateSchema, followupListQuerySchema } from "../schemas/followup.schema.js";
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
    statusId: 1311,
    appointmentAt: values.appointmentAt,
  });
  const saved = await repo().save(followup);
  const catalogValuesById = await getCatalogValuesById();
  res.status(201).json({ ...saved, type: catalogValuesById.get(saved.typeId) ?? null, status: catalogValuesById.get(saved.statusId) ?? null });
}

export async function listFollowups(req: Request, res: Response) {
  const { page, pageSize, skip } = parsePagination(req);
  const filters = followupListQuerySchema.parse(req.query);

  const qb = repo().createQueryBuilder("f");
  if (filters.petId) qb.andWhere("f.petId = :petId", { petId: filters.petId });
  if (filters.userId) qb.andWhere("f.userId = :userId", { userId: filters.userId });
  if (filters.typeId) qb.andWhere("f.typeId = :typeId", { typeId: filters.typeId });
  if (filters.statusId) qb.andWhere("f.statusId = :statusId", { statusId: filters.statusId });

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
