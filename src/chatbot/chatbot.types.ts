import type OpenAI from "openai";

export type ChatRole = "user" | "assistant" | "system" | "tool";

export type QuickReply = {
  label: string;
  value: string;
};

export type ChatMessageRequest = {
  sessionId?: string;
  message: string;
};

export type ChatBotMessage = {
  role: "assistant";
  type: "text";
  text: string;
};

export type ToolCallTrace = {
  toolName: string;
  arguments: unknown;
  result: unknown;
  durationMs: number;
};

/**
 * Contexto del usuario autenticado que se propaga al engine y a las tools.
 * Las tools que necesiten saber quién es el usuario (típicamente las de
 * escritura: crear reporte, solicitar adopción) lo reciben como segundo
 * argumento de su handler.
 */
export type UserContext = {
  userId: number;
  email?: string;
  role?: string;
};

export type ChatResponse = {
  sessionId: string;
  messages: ChatBotMessage[];
  quickReplies?: QuickReply[];
  debug?: {
    detectedIntent?: string | null;
    toolCalls: ToolCallTrace[];
    model: string;
    iterations: number;
    authenticated: boolean;
  };
};

export type SessionMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export type ChatSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
  lastIntent: string | null;
};
