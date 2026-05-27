const INJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Ignorar / sobrescribir instrucciones (ES)
  {
    pattern: /(ignor|olvid)(a|á|e|ar|en|emos|aste|aron)\s+.{0,40}?(instruc|regla|prompt|sistem|todo|previo|anterior)/i,
    reason: "ignore-instructions",
  },
  // Ignorar / sobrescribir instrucciones (EN)
  {
    pattern: /\b(ignore|disregard|forget|override|bypass)\b.{0,40}?(previous|prior|above|system|all|instructions?|rules?|prompt)/i,
    reason: "ignore-instructions-en",
  },
  // Revelación del system prompt
  {
    pattern: /(system\s*prompt|prompt\s*(del?\s*)?sistema|instrucciones?\s+(del\s+)?sistem|tus?\s+instrucciones?|instrucciones?\s+(iniciales|originales))/i,
    reason: "leak-prompt",
  },
  {
    pattern: /\b(reveal|show|print|repeat|display|expose|leak)\b.{0,40}?(prompt|instructions?|rules?|system)/i,
    reason: "leak-prompt-en",
  },
  {
    pattern: /(revel[aá]me?|mostr[aá]me?|repet[ií]me?|dec[ií]me)\s+.{0,30}?(prompt|instruc|regla|sistem)/i,
    reason: "leak-prompt-es",
  },
  // Personajes desbloqueados clásicos
  {
    pattern: /\b(DAN|do\s+anything\s+now|jailbreak|developer\s*mode|modo\s+desarrollador|modo\s+desbloqueado|sin\s+restricciones|unrestricted)\b/i,
    reason: "jailbreak-persona",
  },
  // Role-play hijack típico
  {
    pattern: /(act[uú]a|pretende|imagin[aáaá]|finge|simul[aá]|hac[eé](te)?\s+pasar|haces?\s+de\s+cuenta)\s+.{0,60}?(sin|otro|otra|diferente|inteligencia|asistente|sistema|persona|character|sos|eres|que\s+s[oí])/i,
    reason: "roleplay-hijack",
  },
  {
    pattern: /\b(pretend|act\s+as|you\s+are\s+now|roleplay|role\s*play)\b.{0,60}?(without|unrestricted|different|another|new|character|assistant)/i,
    reason: "roleplay-hijack-en",
  },
  // Pedidos explícitos de generar código / salir del dominio
  {
    pattern: /(escrib[ií]me?|gener[aá]me?|hac[eé]me?|dame|cre[aá]me?)\s+.{0,60}?(c[oó]digo|script|programa|funci[oó]n|exploit|payload|sql|shell|bash|python|javascript)/i,
    reason: "code-generation",
  },
  {
    pattern: /\b(write|generate|give\s+me|code\s+me|build\s+me)\b.{0,60}?(code|script|program|function|exploit|payload|sql|shell|bash|python|javascript)/i,
    reason: "code-generation-en",
  },
];

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string };

export function inspectUserMessage(message: string): GuardResult {
  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { ok: false, reason };
    }
  }
  return { ok: true };
}

/** Tope de longitud para evitar mensajes gigantes que quemen tokens. */
export const MAX_MESSAGE_LENGTH = 2000;
