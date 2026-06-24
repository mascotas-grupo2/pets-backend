import { randomUUID } from "crypto";
import type OpenAI from "openai";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { ChatMessage } from "../entity/ChatMessage.js";
import { ChatSession as ChatSessionEntity } from "../entity/ChatSession.js";
import { SessionMessage, ChatSession } from "./chatbot.types.js";

/**
 * Store de sesiones con persistencia en Postgres.
 *
 * Mantiene la MISMA interfaz pública que la versión anterior en memoria
 * (`getOrCreateSession`, `appendMessages`, `setLastIntent`) para no romper
 * al engine, pero ahora las sesiones sobreviven a reinicios del backend
 * y soportan múltiples instancias detrás de un load balancer.
 *
 * Detalle de truncado: el historial pasado al LLM se limita a los últimos
 * N mensajes (env CHAT_HISTORY_LIMIT) para controlar el costo de tokens.
 * Igual persistimos todos los mensajes en DB para auditoría.
 */

const DEFAULT_HISTORY_LIMIT = 20;

function historyLimit() {
  const raw = Number(process.env.CHAT_HISTORY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HISTORY_LIMIT;
}

function sessionRepo() {
  return dbManager().getRepository(ChatSessionEntity);
}

function messageRepo() {
  return dbManager().getRepository(ChatMessage);
}

/**
 * Reconstruye el `SessionMessage` (formato OpenAI) desde un row de chat_message.
 * Los mensajes role="assistant" pueden tener tool_calls; los role="tool" tienen
 * tool_call_id; el resto es solo content. Devolvemos el shape mínimo que cada
 * tipo de mensaje necesita.
 */
function rowToSessionMessage(row: ChatMessage): SessionMessage {
  const role = row.role as "user" | "assistant" | "system" | "tool";
  switch (role) {
    case "assistant": {
      const msg: any = { role: "assistant", content: row.content };
      if (row.toolCalls) msg.tool_calls = row.toolCalls;
      return msg;
    }
    case "tool":
      return {
        role: "tool",
        tool_call_id: row.toolCallId ?? "",
        content: row.content ?? "",
      };
    case "system":
      return { role: "system", content: row.content ?? "" };
    case "user":
    default:
      return { role: "user", content: row.content ?? "" };
  }
}

/**
 * Carga (o crea) una sesión y trae el historial reciente (limitado por
 * historyLimit) para que el engine pueda armar el contexto del LLM.
 */
export async function getOrCreateSession(
  sessionId?: string,
  userId?: number,
): Promise<ChatSession> {
  if (sessionId) {
    const existing = await sessionRepo().findOneBy({ id: sessionId });
    if (existing) {
      // Refrescar updated_at de la sesión al cargarla
      existing.updatedAt = new Date();
      if (userId && !existing.userId) {
        existing.userId = userId;
      }
      await sessionRepo().save(existing);

      // Traer los últimos N mensajes ordenados cronológicamente
      const limit = historyLimit();
      const recent = await messageRepo().find({
        where: { sessionId: existing.id },
        order: { id: "DESC" },
        take: limit,
      });
      // Invertimos para tenerlos en orden cronológico ascendente
      let messages: SessionMessage[] = recent.reverse().map(rowToSessionMessage);
      // Si el primer mensaje quedó como "tool" sin su assistant previo (por
      // truncado), lo descartamos: el LLM no acepta tool messages huérfanos.
      while (messages.length > 0 && messages[0].role === "tool") {
        messages.shift();
      }
      return {
        id: existing.id,
        createdAt: existing.createdAt.getTime(),
        updatedAt: existing.updatedAt.getTime(),
        messages,
        lastIntent: existing.lastIntent,
      };
    }
  }

  // No existe (o no se pasó id): crear una nueva sesión
  const id = sessionId ?? randomUUID();
  const created = sessionRepo().create({
    id,
    userId: userId ?? null,
    lastIntent: null,
  });
  await sessionRepo().save(created);
  return {
    id: created.id,
    createdAt: created.createdAt.getTime(),
    updatedAt: created.updatedAt.getTime(),
    messages: [],
    lastIntent: null,
  };
}

/**
 * Persiste los mensajes nuevos en la DB y los acumula en el array en memoria
 * de la sesión activa (para que el loop del engine pueda seguir usándolos
 * sin re-leer la DB en cada iteración).
 */
export async function appendMessages(
  session: ChatSession,
  messages: SessionMessage[],
): Promise<void> {
  const rows = messages.map((msg) => {
    const m = msg as OpenAI.Chat.Completions.ChatCompletionMessageParam;
    const role = (m as any).role;
    const content = typeof (m as any).content === "string"
      ? (m as any).content
      : null;
    const toolCallId =
      role === "tool" ? (m as any).tool_call_id ?? null : null;
    const toolCalls =
      role === "assistant" && (m as any).tool_calls
        ? (m as any).tool_calls
        : null;
    return messageRepo().create({
      sessionId: session.id,
      role,
      content,
      toolCallId,
      toolCalls,
    });
  });
  if (rows.length > 0) await messageRepo().save(rows);

  // Acumular en memoria (para el loop del engine)
  session.messages.push(...messages);
  session.updatedAt = Date.now();

  // Truncado en memoria igual que antes (no en DB)
  const limit = historyLimit();
  if (session.messages.length > limit) {
    session.messages = session.messages.slice(-limit);
    while (session.messages.length > 0 && session.messages[0].role === "tool") {
      session.messages.shift();
    }
  }
}

/**
 * Actualiza el último intent inferido (metadata para observabilidad).
 */
export async function setLastIntent(
  session: ChatSession,
  intent: string | null,
): Promise<void> {
  session.lastIntent = intent;
  await sessionRepo().update({ id: session.id }, { lastIntent: intent });
}

/** Útil para tests o un endpoint admin. */
export async function debugListSessions() {
  const sessions = await sessionRepo().find({
    order: { updatedAt: "DESC" },
    take: 50,
  });
  return sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    lastIntent: s.lastIntent,
    updatedAt: s.updatedAt.toISOString(),
  }));
}
