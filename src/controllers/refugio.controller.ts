import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Refugio } from "../entity/Refugio.js";

function repo() {
  return dbManager().getRepository(Refugio);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function listRefugios(_req: Request, res: Response) {
  const refugios = await repo().find({ order: { name: "ASC" } });
  res.json(refugios);
}

export async function listPublicRefugios(_req: Request, res: Response) {
  const refugios = await repo().find({
    where: { active: true },
    order: { name: "ASC" },
    select: ["id", "name", "slug"],
  });
  res.json(refugios);
}

export async function getMyRefugio(req: Request, res: Response) {
  const rid = req.authUser?.refugioId ?? null;
  if (rid == null) return res.json(null);
  const refugio = await repo().findOneBy({ id: rid });
  res.json(refugio ?? null);
}

export async function createRefugio(req: Request, res: Response) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio." });
  const baseSlug =
    typeof req.body?.slug === "string" && req.body.slug.trim()
      ? slugify(req.body.slug)
      : slugify(name);
  const slug = baseSlug || `refugio-${Date.now()}`;
  const existing = await repo().findOneBy({ slug });
  if (existing) {
    return res.status(409).json({ error: "Ya existe un refugio con ese slug." });
  }
  const refugio = repo().create({
    name,
    slug,
    email: typeof req.body?.email === "string" ? req.body.email.trim() : null,
    phone: typeof req.body?.phone === "string" ? req.body.phone.trim() : null,
    location:
      typeof req.body?.location === "string" ? req.body.location.trim() : null,
    active: true,
  });
  const saved = await repo().save(refugio);
  res.status(201).json(saved);
}

export async function updateRefugio(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });
  const refugio = await repo().findOneBy({ id });
  if (!refugio) return res.status(404).json({ error: "Refugio no encontrado" });
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    refugio.name = req.body.name.trim();
  }
  if (typeof req.body?.email === "string") {
    refugio.email = req.body.email.trim() || null;
  }
  if (typeof req.body?.phone === "string") {
    refugio.phone = req.body.phone.trim() || null;
  }
  if (typeof req.body?.location === "string") {
    refugio.location = req.body.location.trim() || null;
  }
  if (typeof req.body?.active === "boolean") {
    refugio.active = req.body.active;
  }
  const saved = await repo().save(refugio);
  res.json(saved);
}
