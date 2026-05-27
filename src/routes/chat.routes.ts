import { Router } from "express";
import { sendChatMessage } from "../controllers/chat.controller.js";

export const chatRouter = Router();

chatRouter.post("/message", sendChatMessage);
