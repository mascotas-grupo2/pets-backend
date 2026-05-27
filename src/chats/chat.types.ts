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

export type ChatResponse = {
  sessionId: string;
  messages: ChatBotMessage[];
  quickReplies?: QuickReply[];
  debug?: {
    detectedIntent?: string | null;
    toolCalls: ToolCallTrace[];
    model: string;
    iterations: number;
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
