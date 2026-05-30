import type { Request, Response } from "express";
import {
  getMessages,
  listConversations,
  markConversationRead,
} from "./chat.service.js";

export async function getConversations(req: Request, res: Response) {
  res.json(await listConversations(req.authUser!.id));
}

export async function getConversationMessages(req: Request, res: Response) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const before = typeof req.query.before === "string" ? req.query.before : undefined;

  const messages = await getMessages(req.params.id, req.authUser!.id, { limit, before });
  if (!messages) return res.status(403).json({ error: "Sin acceso a la conversación" });
  res.json(messages);
}

export async function readConversation(req: Request, res: Response) {
  const ok = await markConversationRead(req.params.id, req.authUser!.id);
  if (!ok) return res.status(403).json({ error: "Sin acceso a la conversación" });
  res.json({ ok: true });
}
