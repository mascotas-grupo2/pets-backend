import { Router } from "express";
import { sendChatbotMessage } from "../controllers/chatbot.controller.js";
import { optionalAuth } from "../lib/auth.js";
import { chatbotRateLimiter } from "../chatbot/chatbot.rate-limit.js";

export const chatbotRouter = Router();

// Orden importante:
// 1. optionalAuth: carga req.authUser si hay token (rate-limit lo usa como key).
// 2. chatbotRateLimiter: corta exceso de requests antes de gastar tokens del LLM.
// 3. sendChatbotMessage: handler real.
chatbotRouter.post(
  "/message",
  optionalAuth,
  chatbotRateLimiter,
  sendChatbotMessage,
);
