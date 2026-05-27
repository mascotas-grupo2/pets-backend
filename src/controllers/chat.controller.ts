import { Request, Response } from "express";
import { handleChatMessage } from "../chats/chat.engine.js";
import { REFUSAL_MESSAGE } from "../chats/chat.intents.js";
import {
  inspectUserMessage,
  MAX_MESSAGE_LENGTH,
} from "../chats/chat.guard.js";
import { getOrCreateSession } from "../chats/chat.session.js";

export async function sendChatMessage(req: Request, res: Response) {
  const { sessionId, message } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Mensaje demasiado largo (max ${MAX_MESSAGE_LENGTH} caracteres)`,
    });
  }

  // Pre-filtro heurístico: si matchea un patrón de inyección conocido,
  // rechazamos antes de llamar al LLM (ahorra tokens y bloquea casos
  // obvios sin depender del comportamiento del modelo).
  const guard = inspectUserMessage(message);
  if (!guard.ok) {
    const session = getOrCreateSession(sessionId);
    return res.json({
      sessionId: session.id,
      messages: [
        { role: "assistant", type: "text", text: REFUSAL_MESSAGE },
      ],
      blocked: { reason: guard.reason },
    });
  }

  const debug =
    req.header("x-chat-debug") === "true" || req.body?.debug === true;

  try {
    const response = await handleChatMessage({
      sessionId,
      message,
      debug,
    });
    res.json(response);
  } catch (err) {
    console.error("Error en chat engine:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Error interno del chatbot";
    res.status(500).json({ error: errorMessage });
  }
}
