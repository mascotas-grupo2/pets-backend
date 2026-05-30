import {
  createMessage,
  findParticipant,
  listConversationsForUser,
  listMessages,
  listParticipantUserIds,
  markRead,
  type MessagePage,
} from "./chat.repository.js";
import { toConversationDTO, toMessageDTO, type MessageDTO } from "./chat.dto.js";

export function isParticipant(conversationId: string, userId: number) {
  return findParticipant(conversationId, userId).then((p) => p != null);
}

export async function listConversations(viewerUserId: number) {
  const rows = await listConversationsForUser(viewerUserId);
  return rows.map((r) => toConversationDTO(r.conversation, r.counterpart, r.unread));
}

/** Historial paginado. Devuelve null si el usuario no participa (→ 403). */
export async function getMessages(
  conversationId: string,
  viewerUserId: number,
  page: MessagePage,
) {
  if (!(await isParticipant(conversationId, viewerUserId))) return null;
  const msgs = await listMessages(conversationId, page);
  // El repo los trae de más nuevo a más viejo; la UI los muestra ascendentes.
  return msgs.reverse().map(toMessageDTO);
}

export async function markConversationRead(conversationId: string, viewerUserId: number) {
  if (!(await isParticipant(conversationId, viewerUserId))) return false;
  await markRead(conversationId, viewerUserId);
  return true;
}

export type PostedMessage = { message: MessageDTO; recipientUserIds: number[] };

/**
 * Publica un mensaje en nombre de un usuario. Aplica la autorización por
 * membresía y devuelve, junto al mensaje, a quiénes hay que entregárselo.
 * Null si el emisor no participa de la conversación.
 */
export async function postMessage(
  conversationId: string,
  senderUserId: number,
  text: string,
): Promise<PostedMessage | null> {
  const sender = await findParticipant(conversationId, senderUserId);
  if (!sender) return null;

  const message = await createMessage({
    conversationId,
    senderUserId,
    senderName: sender.displayName,
    text,
  });

  return {
    message: toMessageDTO(message),
    recipientUserIds: await listParticipantUserIds(conversationId),
  };
}
