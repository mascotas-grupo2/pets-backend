import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { getAuthUserFromToken } from "./auth.js";

let io: IOServer | null = null;

/**
 * Inicializa Socket.IO sobre el server HTTP de Express. Cada cliente se
 * autentica en el handshake con un token corto (auth.token) y se une a una sala
 * `user:<id>`; así podemos hacer push de notificaciones a un usuario puntual.
 */
export function initRealtime(server: HttpServer) {
  const allowed = (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  io = new IOServer(server, {
    cors: { origin: allowed.length > 0 ? allowed : true, credentials: true },
  });

  io.on("connection", async (socket) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.query?.token as string | undefined);
    const user = token ? await getAuthUserFromToken(token) : null;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${user.id}`);
    socket.emit("ready");
  });

  console.log("[realtime] Socket.IO inicializado");
  return io;
}

/** Emite un evento a todas las conexiones de un usuario (sus pestañas/dispositivos). */
export function emitToUser(
  userId: number | null | undefined,
  event: string,
  payload: unknown,
) {
  if (!io || !Number.isInteger(userId)) return;
  io.to(`user:${userId}`).emit(event, payload);
}
