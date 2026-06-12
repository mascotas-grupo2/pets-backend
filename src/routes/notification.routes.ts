import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from "../controllers/notification.controller.js";

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get("/", listNotifications);
notificationRouter.get("/unread-count", unreadCount);
notificationRouter.patch("/read-all", markAllRead);
notificationRouter.patch("/:id/read", markRead);
