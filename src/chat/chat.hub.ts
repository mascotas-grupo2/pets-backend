import type { WebSocket } from "ws";

const OPEN = 1; // WebSocket.OPEN

/**
 * Registro de conexiones por usuario y entrega dirigida. La UI nunca recibe un
 * broadcast global: un mensaje sólo llega a las conexiones de los participantes
 * de su conversación.
 *
 * Para escalar a varias instancias del backend, esta clase es el único punto a
 * reemplazar por un publish/subscribe (ej. Redis): la lógica de negocio no cambia.
 */
export class ChatHub {
  private byUser = new Map<number, Set<WebSocket>>();

  add(userId: number, socket: WebSocket) {
    const set = this.byUser.get(userId) ?? new Set();
    set.add(socket);
    this.byUser.set(userId, set);
  }

  remove(userId: number, socket: WebSocket) {
    const set = this.byUser.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.byUser.delete(userId);
  }

  /** Envía el evento sólo a las conexiones de los usuarios indicados. */
  deliver(userIds: number[], event: unknown) {
    const data = JSON.stringify(event);
    for (const userId of userIds) {
      for (const socket of this.byUser.get(userId) ?? []) {
        if (socket.readyState === OPEN) socket.send(data);
      }
    }
  }
}
