import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./chatbot.intents.js";
import {
  appendMessages,
  getOrCreateSession,
  setLastIntent,
} from "./chatbot.session.js";
import { findPetsByStatus, openaiTools, toolsByName } from "./chatbot.tools.js";
import { CatalogIds } from "../lib/catalog-constants.js";
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
 * Detección heurística de intención de CREAR (reporte de mascota perdida,
 * encontrada o adopción) basada en el mensaje del usuario.
 *
 * Se usa para aplicar el auth gate server-side: si el usuario está anónimo
 * y su mensaje sugiere que quiere crear algo, devolvemos el mensaje canónico
 * sin invocar al LLM. Esto es más confiable que esperar que el modelo
 * respete la regla del system prompt (Llama a veces la ignora).
 *
 * Falsos positivos posibles: si alguien dice "perdí mi paraguas en el bar",
 * va a recibir el mensaje de auth. Para Huellitas Unidas, "perdí" casi
 * siempre significa "perdí mi mascota", así que es aceptable.
 */
function userIntendsToCreate(message: string): boolean {
  // Bug fix: \b en JavaScript no funciona con caracteres acentuados (í, é, ó,
  // etc.) porque no los considera "word characters". Workaround: reemplazar
  // toda la puntuación por espacios y poner padding, así usamos \s como
  // boundary (que sí funciona con tildes).
  const lower = message.toLowerCase();
  const padded = ` ${lower.replace(/[¿?¡!,.;:()"]/g, " ")} `;
  // Verbos típicos del dominio:
  //   - lost: perdí/perdi/perdió/perdio/extravié/extravio/se escapó/se me escapó/se fue/no aparece
  //   - found: encontré/encontre/hallé/halle/se acercó
  //   - adoption: quiero adoptar / me gustaría adoptar / adoptar una/un/mascota
  //   - generic: reportar mascota
  return /\s(perd[ií]|perd[ií]o|extravi[eé]|extravi[oó]|encontr[eé]|hall[eé]|escap[oó]|se\s+(escap[oó]|fue|me\s+escap[oó])|no\s+aparece|quiero\s+adoptar|me\s+gustar[ií]a\s+adoptar|adoptar\s+(una|un|mascota)|reportar\s+(mi|una|un|mascota))\s/i.test(padded);
}

/**
 * Detecta la ENTRADA al flujo de mascota perdida ("perdí mi mascota, ¿qué
 * hago?"): verbo de pérdida + pedido de ayuda genérico, sin detalles todavía.
 * Para este caso mostramos un menú con botones (Ver mascotas / Reportar) tanto
 * para usuarios logueados como anónimos. NO matchea cuando el usuario ya da
 * detalles (zona, color), porque ahí conviene el auth gate / LLM.
 */
function userAsksLostPetHelp(message: string): boolean {
  const padded = ` ${message.toLowerCase().replace(/[¿?¡!,.;:()"]/g, " ")} `;
  const lostVerb = /\s(perd[ií]|perd[ií]o|extravi[eé]|extravi[oó]|se\s+me\s+escap[oó]|se\s+escap[oó])\s/i.test(padded);
  const asksHelp = /\s(qu[eé]\s+hago|qu[eé]\s+hacer|ayuda|ayudame|no\s+s[eé]\s+qu[eé]\s+hacer)\s/i.test(padded);
  return lostVerb && asksHelp;
}

const AUTH_GATE_MESSAGE =
  "Te puedo ayudar con eso. Si querés crear un reporte oficial vas a necesitar " +
  "iniciar sesión primero, pero también podés revisar si alguien ya reportó tu mascota " +
  "buscando en la plataforma (eso no requiere login). ¿Qué preferís hacer?";

/**
 * Quick replies sugeridas cuando se activa el auth gate. Dan al usuario
 * dos caminos claros: seguir como anónimo para buscar, o ir a loguearse
 * si su intención era crear algo.
 */
const AUTH_GATE_QUICK_REPLIES = [
  {
    label: "Buscar reportes existentes",
    value: "Mostrame los reportes que ya hay para ver si está mi mascota",
  },
  {
    label: "Iniciar sesión",
    value: "Quiero iniciar sesión para crear un reporte",
  },
];


/**
 * Detecta cuando el usuario quiere VER el listado de reportes sin filtros
 * específicos (ej: clickeó el quick reply "Buscar reportes existentes" o
 * tipeó "mostrame qué reportes hay"). Para estos casos usamos un bypass
 * server-side que llama listLostPets + listFoundPets sin filtros y devuelve
 * un formato consistente. Razón: con el modelo actual, el LLM tiende a
 * inventar filtros (animalType/location) cuando el usuario no los provee,
 * lo que produce listas truncadas o tool calls mal formados.
 *
 * NO matcheamos cuando el usuario ya dio filtros (ej: "mostrame perros en
 * Palermo"): ahí dejamos que el LLM haga el trabajo normalmente.
 */
/**
 * Detecta intención de listar reportes (con o sin filtro de tipo de animal).
 * Si menciona zona específica, dejamos que el LLM maneje (filtros de zona
 * tienen mucha variación natural).
 */
function userWantsListing(message: string): boolean {
  const lower = message.toLowerCase();
  const padded = ` ${lower.replace(/[¿?¡!,.;:()"]/g, " ")} `;
  const hasListVerb = /\s(mostrame|mostr[aá]|ver|listame|list[aá]|mostr[aá]me|quiero\s+ver|qu[eé]\s+reportes|qu[eé]\s+mascotas)\s/i.test(padded);
  const mentionsReports = /\s(reportes?|mascotas?|listado|perros?|gatos?|otros?)\s/i.test(padded);
  // Si menciona zona específica, NO matchea (el LLM lo maneja mejor)
  const hasLocation = /\b(en\s+\w+|zona\s+|barrio\s+|palermo|belgrano|villa\s+urquiza|almagro|caballito|recoleta|flores|boedo|villa\s+crespo|san\s+telmo)\b/i.test(lower);
  return hasListVerb && mentionsReports && !hasLocation;
}

/**
 * Extrae el tipo de animal del mensaje del usuario. Devuelve null si no
 * mencionó tipo (caso "mostrame reportes" sin más). En ese caso preguntamos.
 */
function detectListingAnimalType(message: string): "perro" | "gato" | "otro" | null {
  const lower = message.toLowerCase();
  if (/\b(perros?|canes?)\b/i.test(lower)) return "perro";
  if (/\b(gatos?|felinos?|mininos?)\b/i.test(lower)) return "gato";
  if (/\botros?\s+animal/i.test(lower)) return "otro";
  return null;
}

type MinimalPet = {
  id?: number | string;
  name?: string | null;
  description?: string | null;
  animalType?: string | null;
  breed?: string | null;
  color?: string | null;
  location?: string | null;
  date?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
};

function formatPet(pet: MinimalPet): string {
  // Construye una línea por mascota mostrando solo campos con valor real.
  const head = pet.name ? `${pet.name} — ` : "";
  const descParts: string[] = [];
  if (pet.animalType) descParts.push(pet.animalType);
  if (pet.breed) descParts.push(pet.breed);
  if (pet.color) descParts.push(pet.color);
  if (descParts.length === 0 && pet.description) {
    descParts.push(pet.description.slice(0, 80));
  }
  const desc = descParts.join(" ");
  // Cuando NO hay nombre, la línea arranca con el tipo de animal en
  // minúscula (viene así de la DB). Lo capitalizamos para que la oración
  // se lea natural: "Perro mestizo..." en vez de "perro mestizo...".
  const body = head ? `${head}${desc}` : desc.charAt(0).toUpperCase() + desc.slice(1);
  const where = pet.location ? `, en ${pet.location}` : "";
  const when = pet.date ? `, ${pet.date}` : "";
  const contact = pet.contactPhone
    ? `. Contacto: ${pet.contactPhone}`
    : pet.contactEmail
      ? `. Contacto: ${pet.contactEmail}`
      : "";
  return `- ${body}${where}${when}${contact}.`;
}

async function buildListingsBypassMessage(
  animalType: "perro" | "gato" | "otro",
): Promise<string> {
  // Perdidos incluye tanto a las mascotas que busca su dueño como a los
  // avistajes de animales sin dueño (ambos se reportan como "perdido").
  const lost = await findPetsByStatus({
    statusId: CatalogIds.petStatus.perdido,
    animalType,
    limit: 5,
  });

  const labelPlural =
    animalType === "perro" ? "perros" : animalType === "gato" ? "gatos" : "otros animales";

  const parts: string[] = [];
  if (lost.length === 0) {
    return `Por ahora no hay reportes activos de ${labelPlural}. ¿Querés probar con otro tipo de animal o filtrar por zona?`;
  }

  parts.push(`Reportes recientes de ${labelPlural} perdidos:`);
  parts.push(lost.map(formatPet).join("\n"));
  parts.push("");
  parts.push("¿Alguna coincide con la que buscás? Si querés filtrar por barrio, decímelo.");
  return parts.join("\n");
}

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

  // MENÚ DE MASCOTA PERDIDA (logueado o anónimo): cuando el usuario entra con
  // "perdí mi mascota, ¿qué hago?" le ofrecemos dos caminos con botones.
  // "Ver mascotas" reusa el bypass de listado (lleva a elegir Perro/Gato) y
  // "Reportar" cae en el auth gate si es anónimo, o en el slot-filling del LLM
  // si está logueado. Va ANTES del auth gate para mostrarse en ambos casos.
  if (userAsksLostPetHelp(params.message)) {
    const menuText =
      "Te ayudo. ¿Querés ver las mascotas ya reportadas (por si está la tuya) " +
      "o reportar tu mascota perdida?";
    await appendMessages(session, [{ role: "assistant", content: menuText }]);
    await setLastIntent(session, "lost_pet_menu");

    const response: ChatResponse = {
      sessionId: session.id,
      messages: [{ role: "assistant", type: "text", text: menuText }],
      quickReplies: [
        { label: "Ver mascotas", value: "Mostrame los reportes que ya hay" },
        { label: "Reportar", value: "Quiero reportar mi mascota perdida" },
      ],
    };
    if (debugEnabled) {
      response.debug = {
        detectedIntent: "lost_pet_menu",
        toolCalls: [],
        model: model(),
        iterations: 0,
        authenticated: !!params.userContext,
      };
    }
    return response;
  }

  // AUTH GATE SERVER-SIDE: si el usuario está anónimo y su mensaje sugiere
  // intención de crear, devolvemos el mensaje canónico sin invocar al LLM.
  // Esto es 100% determinístico y no depende de que el modelo respete el
  // prompt (Llama a veces lo ignora). Ahorra tokens y latencia también.
  if (!params.userContext && userIntendsToCreate(params.message)) {
    await appendMessages(session, [
      { role: "assistant", content: AUTH_GATE_MESSAGE },
    ]);
    await setLastIntent(session, "auth_required");

    const response: ChatResponse = {
      sessionId: session.id,
      messages: [
        { role: "assistant", type: "text", text: AUTH_GATE_MESSAGE },
      ],
      quickReplies: AUTH_GATE_QUICK_REPLIES,
    };
    if (params.debug === true || process.env.CHAT_DEBUG === "true") {
      response.debug = {
        detectedIntent: "auth_required",
        toolCalls: [],
        model: model(),
        iterations: 0,
        authenticated: false,
      };
    }
    return response;
  }

  // SEGUNDO BYPASS SERVER-SIDE: listado genérico de reportes.
  // Cuando el usuario tipea "mostrame los reportes" o equivalentes sin
  // dar filtros, llamamos las tools directamente y formateamos. Esto evita
  // que el LLM invente animalType/location y produzca tool calls mal
  // formados (problema observado con llama-3.1-8b-instant).
  if (userWantsListing(params.message)) {
    const animalType = detectListingAnimalType(params.message);
    if (animalType === null) {
      // Sin tipo específico: preguntar al usuario qué quiere ver
      const askText =
        "¿Qué tipo de mascota te interesa ver? Tocá una opción:";
      await appendMessages(session, [
        { role: "assistant", content: askText },
      ]);
      await setLastIntent(session, "listing_pick_type");
      const response: ChatResponse = {
        sessionId: session.id,
        messages: [{ role: "assistant", type: "text", text: askText }],
        quickReplies: [
          { label: "Reportes de perros", value: "Mostrame los reportes de perros" },
          { label: "Reportes de gatos", value: "Mostrame los reportes de gatos" },
          { label: "Otros animales", value: "Mostrame los reportes de otros animales" },
        ],
      };
      if (params.debug === true || process.env.CHAT_DEBUG === "true") {
        response.debug = {
          detectedIntent: "listing_pick_type",
          toolCalls: [],
          model: model(),
          iterations: 0,
          authenticated: !!params.userContext,
        };
      }
      return response;
    }

    // Con tipo concreto: mostrar el listado filtrado
    const listingText = await buildListingsBypassMessage(animalType);
    await appendMessages(session, [
      { role: "assistant", content: listingText },
    ]);
    await setLastIntent(session, "listing");

    const response: ChatResponse = {
      sessionId: session.id,
      messages: [{ role: "assistant", type: "text", text: listingText }],
    };
    if (params.debug === true || process.env.CHAT_DEBUG === "true") {
      response.debug = {
        detectedIntent: "listing",
        toolCalls: [],
        model: model(),
        iterations: 0,
        authenticated: !!params.userContext,
      };
    }
    return response;
  }

  const client = getClient();
  const tracedToolCalls: ToolCallTrace[] = [];
  let lastIntent: string | null = session.lastIntent;
  let iterations = 0;
  let finalAssistantText = "";

  // System messages: el prompt principal + (opcional) el contexto del usuario.
  // Se inyectan en cada call para que no se trunquen junto con el historial.
  const userContextPrompt = buildUserContextPrompt(params.userContext);
  // Inyectamos la fecha actual al modelo. Sin esto, el LLM no sabe qué día
  // es hoy (su conocimiento puede estar varios meses atrasado) y termina
  // guardando fechas como "hoy", "ayer" en texto literal.
  const today = new Date();
  const dateContext = `Fecha actual: ${today.toISOString().slice(0, 10)} (formato YYYY-MM-DD). Si el usuario dice "hoy", "ayer" o "anteayer", calculá la fecha real basándote en esto y pasala SIEMPRE en formato YYYY-MM-DD a las tools de creación. NUNCA pases "hoy" o "ayer" como string literal.`;
  const systemMessages: SessionMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: userContextPrompt },
    { role: "system", content: dateContext },
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
