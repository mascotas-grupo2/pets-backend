import { Router } from "express";
import { sendChatMessage } from "../controllers/chat.controller";

export const chatRouter = Router();

chatRouter.post("/message", sendChatMessage);
