import { In } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Conversation } from "./conversation.entity.js";
import { ConversationParticipant } from "./participant.entity.js";
import { Message } from "./message.entity.js";

const conversations = () => AppDataSource.getRepository(Conversation);
const participants = () => AppDataSource.getRepository(ConversationParticipant);
const messages = () => AppDataSource.getRepository(Message);

export function findParticipant(conversationId: string, userId: number) {
  return participants().findOneBy({ conversationId, userId });
}

/** Ids de los usuarios registrados que participan (a quiénes entregar). */
export async function listParticipantUserIds(conversationId: string): Promise<number[]> {
  const rows = await participants().find({ where: { conversationId } });
  return rows
    .map((r) => r.userId)
    .filter((id): id is number => id != null);
}

export type ConversationRow = {
  conversation: Conversation;
  counterpart: ConversationParticipant | null;
  unread: number;
};

/**
 * Conversaciones donde participa el usuario, con su contraparte y la cantidad de
 * no leídos. Los no leídos se calculan con una sola consulta agregada (no N+1).
 */
export async function listConversationsForUser(userId: number): Promise<ConversationRow[]> {
  const mine = await participants().find({ where: { userId } });
  const ids = mine.map((p) => p.conversationId);
  if (ids.length === 0) return [];

  const convs = await conversations().find({
    where: { id: In(ids) },
    order: { lastMessageAt: "DESC" },
  });

  const members = await participants().find({
    where: { conversationId: In(ids), role: "member" },
  });
  const counterpartByConv = new Map(members.map((m) => [m.conversationId, m]));

  const unreadRows = await messages()
    .createQueryBuilder("m")
    .innerJoin(
      ConversationParticipant,
      "p",
      "p.conversationId = m.conversationId AND p.userId = :userId",
      { userId },
    )
    .select("m.conversationId", "conversationId")
    .addSelect("COUNT(*)", "count")
    .where("m.conversationId IN (:...ids)", { ids })
    .andWhere("(m.senderUserId IS NULL OR m.senderUserId <> :userId)", { userId })
    .andWhere("(p.lastReadAt IS NULL OR m.createdAt > p.lastReadAt)")
    .groupBy("m.conversationId")
    .getRawMany<{ conversationId: string; count: string }>();
  const unreadByConv = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

  return convs.map((conversation) => ({
    conversation,
    counterpart: counterpartByConv.get(conversation.id) ?? null,
    unread: unreadByConv.get(conversation.id) ?? 0,
  }));
}

export type MessagePage = { limit: number; before?: string };

/** Página de mensajes (los `limit` más recientes, opcionalmente antes de un cursor). */
export function listMessages(conversationId: string, { limit, before }: MessagePage) {
  const qb = messages()
    .createQueryBuilder("m")
    .where("m.conversationId = :conversationId", { conversationId })
    .orderBy("m.createdAt", "DESC")
    .take(limit);
  if (before) qb.andWhere("m.createdAt < :before", { before });
  return qb.getMany();
}

export async function createMessage(input: {
  conversationId: string;
  senderUserId: number | null;
  senderName: string;
  text: string;
}) {
  const message = await messages().save(messages().create(input));
  await conversations().update(
    { id: input.conversationId },
    { lastMessageAt: message.createdAt },
  );
  return message;
}

export async function markRead(conversationId: string, userId: number) {
  await participants().update({ conversationId, userId }, { lastReadAt: new Date() });
}
