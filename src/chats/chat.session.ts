import { randomUUID } from "crypto";
import { ChatSession, SessionMessage } from "./chat.types.js";

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_TTL_MINUTES = 60;

function historyLimit() {
  const raw = Number(process.env.CHAT_HISTORY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_HISTORY_LIMIT;
}

function ttlMs() {
  const raw = Number(process.env.CHAT_SESSION_TTL_MINUTES);
  const minutes =
    Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MINUTES;
  return minutes * 60 * 1000;
}

/**
 * Store de sesiones en memoria. Suficiente para la demo por API; al reiniciar
 * el proceso las sesiones se pierden. Si se quisiera persistir, basta con
 * reemplazar este módulo por uno que use TypeORM (entidad ChatSession +
 * ChatMessage) sin tocar el engine.
 */
const sessions = new Map<string, ChatSession>();

function purgeExpired() {
  const cutoff = Date.now() - ttlMs();
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
}

export function getOrCreateSession(sessionId?: string): ChatSession {
  purgeExpired();

  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }
  }

  const id = sessionId ?? randomUUID();
  const session: ChatSession = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    lastIntent: null,
  };
  sessions.set(id, session);
  return session;
}

export function appendMessages(
  session: ChatSession,
  messages: SessionMessage[],
) {
  session.messages.push(...messages);

  // Mantener solo los últimos N mensajes para controlar tokens.
  // No truncamos pares assistant+tool a la mitad: si el primer mensaje es
  // un "tool" sin su "assistant" previo, lo eliminamos para evitar errores.
  const limit = historyLimit();
  if (session.messages.length > limit) {
    session.messages = session.messages.slice(-limit);
    while (
      session.messages.length > 0 &&
      session.messages[0].role === "tool"
    ) {
      session.messages.shift();
    }
  }

  session.updatedAt = Date.now();
}

export function setLastIntent(session: ChatSession, intent: string | null) {
  session.lastIntent = intent;
}

/** Útil para tests o un endpoint debug. */
export function debugListSessions() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    messageCount: s.messages.length,
    lastIntent: s.lastIntent,
    updatedAt: new Date(s.updatedAt).toISOString(),
  }));
}
