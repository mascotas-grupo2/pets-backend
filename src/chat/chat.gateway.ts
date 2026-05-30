import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import { authenticateToken } from "../lib/auth.js";
import { ChatHub } from "./chat.hub.js";
import { postMessage } from "./chat.service.js";

type IncomingFrame = { type?: string; conversationId?: unknown; text?: unknown };

/** Extrae una cookie del header crudo del handshake. */
function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Gateway WebSocket de mensajería. Autentica con la cookie `auth_token` (mismo
 * JWT que el REST), delega la persistencia y la autorización al servicio, y
 * entrega cada mensaje sólo a los participantes de su conversación vía el hub.
 */
export function createChatGateway(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });
  const hub = new ChatHub();

  wss.on("connection", async (socket, req) => {
    const token = readCookie(req.headers.cookie, "auth_token");
    const authUser = token ? await authenticateToken(token) : null;
    if (!authUser) {
      socket.close(4401, "No autenticado");
      return;
    }

    hub.add(authUser.id, socket);
    socket.on("close", () => hub.remove(authUser.id, socket));

    socket.on("message", async (raw) => {
      let frame: IncomingFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (frame.type !== "message") return;

      const conversationId = frame.conversationId;
      const text = typeof frame.text === "string" ? frame.text.trim() : "";
      if (typeof conversationId !== "string" || !text) return;

      const posted = await postMessage(conversationId, authUser.id, text);
      if (!posted) return; // no participa de la conversación → se descarta

      hub.deliver(posted.recipientUserIds, {
        type: "message",
        conversationId,
        message: posted.message,
      });
    });
  });

  return wss;
}
