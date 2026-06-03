import { Request, Response } from "express";
import { handleChatMessage } from "../chatbot/chatbot.engine.js";
import { REFUSAL_MESSAGE } from "../chatbot/chatbot.intents.js";
import {
  inspectUserMessage,
  MAX_MESSAGE_LENGTH,
} from "../chatbot/chatbot.guard.js";
import { getOrCreateSession } from "../chatbot/chatbot.session.js";
import type { UserContext } from "../chatbot/chatbot.types.js";

export async function sendChatbotMessage(req: Request, res: Response) {
  const { sessionId, message } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Mensaje demasiado largo (max ${MAX_MESSAGE_LENGTH} caracteres)`,
    });
  }

  const guard = inspectUserMessage(message);
  if (!guard.ok) {
    const session = await getOrCreateSession(sessionId, req.authUser?.id);
    return res.json({
      sessionId: session.id,
      messages: [{ role: "assistant", type: "text", text: REFUSAL_MESSAGE }],
      blocked: { reason: guard.reason },
    });
  }

  const debug =
    req.header("x-chat-debug") === "true" || req.body?.debug === true;

  const userContext: UserContext | undefined = req.authUser
    ? {
        userId: req.authUser.id,
        email: req.authUser.email,
        role: req.authUser.role,
      }
    : undefined;

  try {
    const response = await handleChatMessage({
      sessionId,
      message,
      debug,
      userContext,
    });
    res.json(response);
  } catch (err) {
    console.error("Error en chat engine:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Error interno del chatbot";
    res.status(500).json({ error: errorMessage });
  }
}
