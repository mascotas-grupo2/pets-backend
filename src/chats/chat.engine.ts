import { randomUUID } from "crypto";
import { chatIntents } from "./chat.intents.js";
import { ChatResponse } from "./chat.types.js";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function findIntent(message: string) {
  const normalized = normalize(message);

  return chatIntents.find((intent) => {
    if (normalized === normalize(intent.id)) return true;

    return intent.triggers.some((trigger) =>
      normalized.includes(normalize(trigger))
    );
  });
}


export function handleChatMessage(params: {
  sessionId?: string;
  message: string;
}): ChatResponse {
  const sessionId = params.sessionId ?? randomUUID();
  const intent = findIntent(params.message);

  if (!intent) {
    return {
      sessionId,
      messages: [
        {
          role: "assistant",
          type: "text",
          text: "Puedo ayudarte con reportes de mascotas perdidas, encontradas y adopciones. ¿Sobre cuál de esos temas querés consultar?",
        },
      ],
      quickReplies: [
        { label: "Perdí una mascota", value: "lost_pet_help" },
        { label: "Encontré una mascota", value: "found_pet_help" },
        { label: "Quiero adoptar", value: "adoption_help" },
      ],
    };
  }

  return {
    sessionId,
    messages: [
      {
        role: "assistant",
        type: "text",
        text: intent.response.text,
      },
    ],
    quickReplies: intent.response.quickReplies,
  };
}
