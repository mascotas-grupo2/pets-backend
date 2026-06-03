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

/**
 * Detecta si una respuesta del modelo contiene sintaxis de tool call leakeada
 * como texto (descripción del schema entre <...>, JSON de args suelto, etc.).
 *
 * Esto pasa cuando el modelo intenta invocar una tool pero, en vez de usar el
 * mecanismo formal de tool_calls del SDK, escribe el contenido como texto
 * plano en su respuesta. Si esto sucede SIN un tool_calls real asociado,
 * cualquier "resultado" que el modelo escriba después es alucinación: la
 * tool nunca se ejecutó.
 */
/**
 * Lista de nombres de tools (debe mantenerse sincronizada con chatbot.tools.ts).
 * El system prompt prohíbe al modelo mencionarlas al usuario, así que cualquier
 * aparición en el texto de respuesta es señal de leak.
 */
const TOOL_NAMES_RE = /\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|createLostPetReport|createFoundPetReport|createAdoptionRequest)\b/;

function detectsLeakedToolCall(text: string | null | undefined): boolean {
  if (!text) return false;
  // Mención de cualquier tool name (independiente del formato: paréntesis,
  // angle brackets, dos puntos, signo mayor, etc.). El prompt prohíbe
  // mencionar tools al usuario, así que cualquier aparición es leak.
  if (TOOL_NAMES_RE.test(text)) return true;
  // Descripción de tool entre <...> con más de 30 chars (típico del schema)
  if (/<[^<>]{30,}>/.test(text)) return true;
  // JSON suelto al inicio: {"animalType": "..."}
  if (/^\s*\{\s*"\w+"\s*:[^{}]+\}/.test(text)) return true;
  return false;
}

function sanitizeAssistantText(text: string): string {
  let out = text;
  // Tags estilo Hermes: <function=name>{...}</function>
  out = out.replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "").trim();
  // Apertura sin cierre
  out = out.replace(/<function[^>]*>[\s\S]*$/gi, "").trim();
  // Tool call leakeado como texto: <descripción larga> {args json}
  // Algunos modelos imprimen literalmente la description del schema seguida
  // de los args en JSON, en vez de invocar el mecanismo formal de tool_calls.
  out = out.replace(/<[^<>]{30,}>\s*\{[^{}]*\}/g, "").trim();
  // Solo la descripción larga sin args (por si el JSON quedó separado o ausente)
  out = out.replace(/<[^<>]{30,}>/g, "").trim();
  // JSON huérfano al inicio (args sueltos del modelo)
  out = out.replace(/^\s*\{\s*"\w+"\s*:[^{}]+\}\s*/g, "").trim();
  // Patrón toolName>{json} (algunos modelos inventan este separador)
  out = out.replace(/\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|createLostPetReport|createFoundPetReport|createAdoptionRequest)\s*>\s*\{[^{}]*\}/g, "").trim();
  // Llamadas tipo Python que algunos modelos sueltan: tool_name({...})
  out = out.replace(/\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|createLostPetReport|createFoundPetReport|createAdoptionRequest)\s*\([^)]*\)/g, "").trim();
  // Cualquier mención residual del nombre de la tool
  out = out.replace(/\b(listLostPets|listFoundPets|listAdoptablePets|getPetDetails|getAdoptionInfo|createLostPetReport|createFoundPetReport|createAdoptionRequest)\b/g, "").trim();
  // Espacios sobrantes
  out = out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/**
 * Arma un fragmento de system message que indica el estado de autenticación
 * del usuario. Se inyecta SIEMPRE (logueado o anónimo) para que el modelo
 * sepa con quién está hablando y pueda aplicar las reglas de auth gate
 * antes de iniciar flujos de creación.
 */
function buildUserContextPrompt(userContext?: UserContext): string {
  if (userContext) {
    const parts = [
      `ESTADO DE AUTH: el usuario ESTÁ AUTENTICADO.`,
      userContext.email ? `Su email es ${userContext.email}.` : null,
      `Podés mencionar que está logueado si es natural, pero NO reveles su email ni datos personales salvo que él los pida explícitamente.`,
    ].filter(Boolean);
    return parts.join(" ");
  }
  return (
    `ESTADO DE AUTH: el usuario NO está autenticado (anónimo). ` +
    `Las tools de escritura (createLostPetReport, createFoundPetReport, ` +
    `createAdoptionRequest) NO van a funcionar para este usuario. ` +
    `Si pide crear un reporte o iniciar adopción, primero pedile que inicie ` +
    `sesión en la app y que después vuelva al chat — NO empieces a recolectar ` +
    `datos hasta que esté autenticado, porque se perderían al perder la sesión.`
  );
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
    { role: "system", content: userContextPrompt },
  ];

  while (iterations < maxIterations()) {
    iterations += 1;

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: model(),
        messages: [...systemMessages, ...session.messages],
        tools: openaiTools,
        tool_choice: "auto",
        temperature: 0.1,
      });
    } catch (err: any) {
      // Groq devuelve 400 cuando el modelo genera un tool call malformado.
      // Logeamos failed_generation para debug pero devolvemos un mensaje
      // amigable al usuario en vez de propagar el 500.
      if (err?.status === 400) {
        console.error(
          "Groq rechazó la llamada del modelo. failed_generation:",
          err?.error?.error?.failed_generation ?? err?.error,
        );
        finalAssistantText =
          "Disculpá, tuve un problema procesando ese mensaje. ¿Podés reformularlo o probar con otra consulta?";
        break;
      }
      throw err;
    }

    const choice = completion.choices[0];
    const assistantMsg = choice.message;

    const toolCalls = assistantMsg.tool_calls ?? [];

    // Detección defensiva: el modelo escribió el tool call como texto en
    // lugar de usar el mecanismo formal. Descartamos la respuesta, inyectamos
    // un warning como system message y forzamos reintento. NO persistimos
    // el assistant message basura.
    if (
      toolCalls.length === 0 &&
      detectsLeakedToolCall(assistantMsg.content)
    ) {
      console.warn(
        "[chatbot] Tool call leakeado como texto. Reintentando con warning. Texto:",
        assistantMsg.content?.slice(0, 200),
      );
      // Inyectamos el warning solo en la conversación local (no persistido)
      // para que el modelo lo vea en el próximo turno del loop.
      session.messages.push({
        role: "system",
        content:
          "ATENCIÓN: tu respuesta anterior incluía sintaxis de tool call como texto sin invocar la herramienta formalmente. Si necesitás llamar una herramienta para responder, USÁ EL MECANISMO DE TOOL_CALLS del SDK — no escribas la descripción ni los argumentos como texto. Reformulá tu respuesta: o invocá la tool correctamente, o respondé sin mencionar herramientas.",
      });
      continue; // siguiente iteración del while
    }

    // Persistir el assistant message una vez confirmado que es válido
    await appendMessages(session, [assistantMsg as unknown as SessionMessage]);

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
