export type ChatRole = "user" | "assistant";

export type QuickReply = {
  label: string;
  value: string;
  action?: {
    type: "message" | "start_flow" | "submit_flow";
    flowId?: string;
  };
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

export type ChatResponse = {
  sessionId: string;
  messages: ChatBotMessage[];
  quickReplies?: QuickReply[];
};

export type ChatIntent = {
  id: string;
  triggers: string[];
  response: {
    text: string;
    quickReplies?: QuickReply[];
  };
};