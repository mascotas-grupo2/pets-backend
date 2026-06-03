import rateLimit from "express-rate-limit";

/**
 * Rate limiter para el endpoint del chatbot.
 *
 * Doble propósito:
 * 1. Evitar abuso de la free tier del proveedor de LLM (Groq tiene ~30 req/min).
 * 2. Mitigar ataques de fuerza bruta sobre el endpoint conversacional.
 *
 * La key del limit es la IP por defecto; si el usuario está autenticado,
 * se usa el userId para que múltiples usuarios detrás de un NAT compartido
 * (oficina, universidad) no se bloqueen entre sí.
 *
 * Vars de entorno (con defaults razonables):
 * - CHAT_RATE_LIMIT_WINDOW_MS: ventana en ms (default 60000 = 1 minuto)
 * - CHAT_RATE_LIMIT_MAX: máximo requests por ventana (default 15)
 */
function readInt(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const windowMs = readInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 60_000);
const max = readInt(process.env.CHAT_RATE_LIMIT_MAX, 15);

export const chatbotRateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Demasiados mensajes en poco tiempo. Esperá unos segundos antes de continuar.",
  },
  keyGenerator: (req) => {
    const userId = (req as any).authUser?.id;
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  },
});
