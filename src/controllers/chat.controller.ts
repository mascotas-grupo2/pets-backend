import { Request, Response } from "express";
import { handleChatMessage } from "../chats/chat.engine";

export async function sendChatMessage(req: Request, res: Response) {
  const { sessionId, message } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }

  const response = handleChatMessage({
    sessionId,
    message,
  });

  res.json(response);
}
