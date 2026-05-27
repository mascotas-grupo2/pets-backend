import OpenAI from "openai";
import { SYSTEM_PROMPT, WELCOME_QUICK_REPLIES } from "./chat.intents.js";
import {
  appendMessages,
  getOrCreateSession,
  setLastIntent,
} from "./chat.session.js";
import { openaiTools, toolsByName } from "./chat.tools.js";
import {
  ChatResponse,
  SessionMessage,
  ToolCallTrace,
} from "./chat.types.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_MAX_ITERATIONS = 5;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * Cliente para Groq.
 *
 * Groq hostea modelos open source (Llama, Mixtral, etc.) con inferencia
 * muy rápida y un free tier generoso. Su API es compatible con OpenAI,
 * por eso reutilizamos el SDK `openai` apuntando al baseURL de Groq.
 *
 * Motivos de la elección:
 *  - Free tier sin tarjeta de crédito (~30 req/min, ~14k req/día).
 *  - Tool calling soportado nativamente.
 *  - Ideal para un proyecto open source: cualquiera puede correrlo
 *    generando su propia API key en https://console.groq.com/keys.
 */
let cachedClient: OpenAI | null = null;
function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY no configurada. Generá una key gratis en " +
        "https://console.groq.com/keys y agregala al .env.",
    );
  }
  cachedClient = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  return cachedClient;
}

function model() {
  return process.env.GROQ_MODEL || DEFAULT_MODEL;
}

function maxIterations() {
  const raw = Number(process.env.CHAT_MAX_TOOL_ITERATIONS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_ITERATIONS;
}

/**
 * Limpia residuos técnicos que algunos modelos open source (Llama, Mixtral)
 * a veces filtran en el texto user-facing en vez de invocar la tool a través
 * del mecanismo formal de tool_calls. Por ejemplo:
 *   "Probemos con <function=draftLostPetReport>{...}</function>"
 *
 * El system prompt ya prohibe este formato, pero esto es defensa en
 * profundidad por si el modelo se desvía.
 */
function sanitizeAssistantText(text: string): string {
  let out = text;
  // Tags estilo Hermes: <function=name>{...}</function>
  out = out.replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "").trim();
  // Apertura sin cierre
  out = out.replace(/<function[^>]*>[\s\S]*$/gi, "").trim();
  // Llamadas tipo Python que algunos modelos sueltan: tool_name({...})
  out = out.replace(/\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|draftLostPetReport)\s*\([^)]*\)/g, "").trim();
  // Espacios sobrantes
  out = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

export type HandleChatParams = {
  sessionId?: string;
  message: string;
  debug?: boolean;
};

export async function handleChatMessage(
  params: HandleChatParams,
): Promise<ChatResponse> {
  const session = getOrCreateSession(params.sessionId);
  const wasEmpty = session.messages.length === 0;
  const debugEnabled =
    params.debug === true || process.env.CHAT_DEBUG === "true";

  // El system prompt no se persiste — se inyecta en cada call para que el
  // modelo siempre lo vea aunque se trunque el historial.
  const userMessage: SessionMessage = {
    role: "user",
    content: params.message,
  };
  appendMessages(session, [userMessage]);

  const client = getClient();
  const tracedToolCalls: ToolCallTrace[] = [];
  let lastIntent: string | null = session.lastIntent;
  let iterations = 0;
  let finalAssistantText = "";

  while (iterations < maxIterations()) {
    iterations += 1;

    const completion = await client.chat.completions.create({
      model: model(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...session.messages,
      ],
      tools: openaiTools,
      tool_choice: "auto",
      // Temperatura baja: queremos comportamiento estable y predecible
      // para una demo, no creatividad.
      temperature: 0.3,
    });

    const choice = completion.choices[0];
    const assistantMsg = choice.message;

    appendMessages(session, [assistantMsg as unknown as SessionMessage]);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalAssistantText = assistantMsg.content ?? "";
      break;
    }

    // Ejecutamos cada tool call y agregamos su resultado al historial
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      const def = toolsByName[call.function.name];
      const started = Date.now();

      let parsedArgs: any = {};
      try {
        parsedArgs = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {
        parsedArgs = {};
      }

      let result: unknown;
      if (!def) {
        result = { error: `Tool desconocida: ${call.function.name}` };
      } else {
        try {
          result = await def.handler(parsedArgs);
          lastIntent = def.intent;
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : "Error ejecutando tool",
          };
        }
      }

      tracedToolCalls.push({
        toolName: call.function.name,
        arguments: parsedArgs,
        result,
        durationMs: Date.now() - started,
      });

      appendMessages(session, [
        {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        },
      ]);
    }
  }

  finalAssistantText = sanitizeAssistantText(finalAssistantText);
  if (!finalAssistantText) {
    finalAssistantText =
      "Disculpá, no pude completar la respuesta. ¿Podés reformular?";
  }

  setLastIntent(session, lastIntent);

  const response: ChatResponse = {
    sessionId: session.id,
    messages: [{ role: "assistant", type: "text", text: finalAssistantText }],
  };

  // En la primera interacción, ofrecemos quick replies de bienvenida
  // (útil para que la demo por API tenga "botones" obvios para probar).
  if (wasEmpty) {
    response.quickReplies = WELCOME_QUICK_REPLIES;
  }

  if (debugEnabled) {
    response.debug = {
      detectedIntent: lastIntent,
      toolCalls: tracedToolCalls,
      model: model(),
      iterations,
    };
  }

  return response;
}
