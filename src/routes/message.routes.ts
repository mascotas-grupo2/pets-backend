import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { getConversation, getInbox, sendMessage, getAdminConversations, deleteMessage, getAdminAlerts } from "../controllers/message.controller.js";
import { requireRefugioAdmin } from "../lib/auth.js";
import { single, multerErrorHandler } from "../middleware/upload.js";

export const messageRouter = Router();

messageRouter.use(requireAuth);

messageRouter.get("/inbox", getInbox);
messageRouter.get("/admin/inbox", requireRefugioAdmin, getAdminConversations);
messageRouter.get("/admin/alerts", requireRefugioAdmin, getAdminAlerts);
messageRouter.get("/conversation/:userId", getConversation);
messageRouter.post("/", single("photo"), multerErrorHandler, sendMessage);
messageRouter.delete("/:id", deleteMessage);
