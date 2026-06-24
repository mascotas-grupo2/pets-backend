import { Request, Response } from "express";
import { AppDataSource } from "../data-source.js";
import { Notification } from "../entity/Notification.js";

function repo() {
  return AppDataSource.getRepository(Notification);
}

/** Lista las notificaciones del usuario (más nuevas primero) + total sin leer. */
export async function listNotifications(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "No autenticado" });
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const items = await repo().find({
    where: { userId },
    order: { createdAt: "DESC" },
    take: limit,
  });
  const unread = await repo().count({ where: { userId, read: false } });
  res.json({ items, unread });
}

/** Solo el contador de no leídas (para el badge de la campana, polling liviano). */
export async function unreadCount(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "No autenticado" });
  const unread = await repo().count({ where: { userId, read: false } });
  res.json({ unread });
}

/** Marca una notificación como leída (solo del propio usuario). */
export async function markRead(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "No autenticado" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Id invalido" });
  await repo().update({ id, userId }, { read: true });
  res.json({ ok: true });
}

/** Marca todas las del usuario como leídas. */
export async function markAllRead(req: Request, res: Response) {
  const userId = req.authUser?.id;
  if (!Number.isInteger(userId)) return res.status(401).json({ error: "No autenticado" });
  await repo().update({ userId, read: false }, { read: true });
  res.json({ ok: true });
}
