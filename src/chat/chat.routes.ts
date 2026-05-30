import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  getConversationMessages,
  getConversations,
  readConversation,
} from "./chat.controller.js";

export const chatRouter = Router();

// El acceso lo gobierna la membresía (requireAuth), no el rol: cada usuario sólo
// ve y escribe en las conversaciones donde participa.
chatRouter.get("/conversations", requireAuth, getConversations);
chatRouter.get("/conversations/:id/messages", requireAuth, getConversationMessages);
chatRouter.patch("/conversations/:id/read", requireAuth, readConversation);
