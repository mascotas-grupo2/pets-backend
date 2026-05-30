import type { Conversation } from "./conversation.entity.js";
import type { ConversationParticipant } from "./participant.entity.js";
import type { Message } from "./message.entity.js";

/**
 * El mensaje viaja con el id de su autor (no con "yo/otro"): cada cliente decide
 * si es propio comparándolo con su userId. Así el DTO no depende del que mira.
 */
export type MessageDTO = {
  id: string;
  senderUserId: number | null;
  senderName: string;
  texto: string;
  createdAt: string;
};

export type ConversationDTO = {
  id: string;
  nombre: string;
  contexto: string;
  asunto: string;
  canal: string;
  noLeidos: number;
  lastMessageAt: string | null;
  perfil: { email: string; telefono: string; mascota: string };
};

export function toMessageDTO(m: Message): MessageDTO {
  return {
    id: m.id,
    senderUserId: m.senderUserId,
    senderName: m.senderName,
    texto: m.text,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toConversationDTO(
  conversation: Conversation,
  counterpart: ConversationParticipant | null,
  unread: number,
): ConversationDTO {
  return {
    id: conversation.id,
    nombre: counterpart?.displayName ?? "Conversación",
    contexto: conversation.context,
    asunto: conversation.subject,
    canal: conversation.channel,
    noLeidos: unread,
    lastMessageAt: conversation.lastMessageAt
      ? conversation.lastMessageAt.toISOString()
      : null,
    perfil: {
      email: counterpart?.email ?? "—",
      telefono: counterpart?.phone ?? "—",
      mascota: conversation.petName ?? "—",
    },
  };
}
