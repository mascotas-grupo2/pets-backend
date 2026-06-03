import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./chatbot.intents.js";
import {
  appendMessages,
  getOrCreateSession,
  setLastIntent,
} from "./chatbot.session.js";
import { openaiTools, toolsByName } from "./chatbot.tools.js";
import {
  ChatResponse,
  SessionMessage,
  ToolCallTrace,
  UserContext,
} from "./chatbot.types.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_MAX_ITERATIONS = 5;
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

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

function sanitizeAssistantText(text: string): string {
  let out = text;
  // Tags estilo Hermes: <function=name>{...}</function>
  out = out.replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "").trim();
  // Apertura sin cierre
  out = out.replace(/<function[^>]*>[\s\S]*$/gi, "").trim();
  // Llamadas tipo Python que algunos modelos sueltan: tool_name({...})
  out = out.replace(/\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|createLostPetReport|createFoundPetReport|createAdoptionRequest)\s*\([^)]*\)/g, "").trim();
  // Espacios sobrantes
  out = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/**
 * Arma un fragmento de system message adicional cuando hay usuario autenticado.
 * Le da al modelo el contexto mínimo necesario sin filtrar datos sensibles
 * (no se le pasa rol completo ni IDs internos).
 */
function buildUserContextPrompt(userContext?: UserContext): string | null {
  if (!userContext) return null;
  const parts = [
    `El usuario está autenticado.`,
    userContext.email ? `Su email es ${userContext.email}.` : null,
    `Podés personalizar el saludo y mencionar que está logueado si es natural en la conversación, pero NO menciones su email ni datos personales a menos que él los pida explícitamente.`,
  ].filter(Boolean);
  return parts.join(" ");
}

export type HandleChatParams = {
  sessionId?: string;
  message: string;
  debug?: boolean;
  /** Si se provee, las tools que necesiten user lo reciben como segundo argumento. */
  userContext?: UserContext;
};

export async function handleChatMessage(
  params: HandleChatParams,
): Promise<ChatResponse> {
  const session = await getOrCreateSession(
    params.sessionId,
    params.userContext?.userId,
  );
  const debugEnabled =
    params.debug === true || process.env.CHAT_DEBUG === "true";

  const userMessage: SessionMessage = {
    role: "user",
    content: params.message,
  };
  await appendMessages(session, [userMessage]);

  const client = getClient();
  const tracedToolCalls: ToolCallTrace[] = [];
  let lastIntent: string | null = session.lastIntent;
  let iterations = 0;
  let finalAssistantText = "";

  // System messages: el prompt principal + (opcional) el contexto del usuario.
  // Se inyectan en cada call para que no se trunquen junto con el historial.
  const userContextPrompt = buildUserContextPrompt(params.userContext);
  const systemMessages: SessionMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(userContextPrompt
      ? ([{ role: "system", content: userContextPrompt }] as SessionMessage[])
      : []),
  ];

  while (iterations < maxIterations()) {
    iterations += 1;

    const completion = await client.chat.completions.create({
      model: model(),
      messages: [...systemMessages, ...session.messages],
      tools: openaiTools,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const choice = completion.choices[0];
    const assistantMsg = choice.message;

    await appendMessages(session, [assistantMsg as unknown as SessionMessage]);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalAssistantText = assistantMsg.content ?? "";
      break;
    }

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
      } else if (def.requiresAuth && !params.userContext) {
        // Tool de escritura sin usuario logueado: rechazamos sin ejecutar.
        // Le decimos al modelo qué pasó para que se lo comunique al usuario
        // en lenguaje natural y le sugiera loguearse.
        result = {
          error: "auth_required",
          message:
            "Esta acción requiere que el usuario esté autenticado. Pedile que inicie sesión y vuelva a intentar.",
        };
      } else {
        try {
          result = await def.handler(parsedArgs, params.userContext);
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

      await appendMessages(session, [
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

  await setLastIntent(session, lastIntent);

  const response: ChatResponse = {
    sessionId: session.id,
    messages: [{ role: "assistant", type: "text", text: finalAssistantText }],
  };

  if (debugEnabled) {
    response.debug = {
      detectedIntent: lastIntent,
      toolCalls: tracedToolCalls,
      model: model(),
      iterations,
      authenticated: Boolean(params.userContext),
    };
  }

  return response;
}
