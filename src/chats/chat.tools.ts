import type OpenAI from "openai";
import { ILike } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import { getCatalogValuesById } from "../lib/catalog-values.js";

export type ToolHandler = (args: any) => Promise<unknown>;

export type ToolDefinition = {
  schema: OpenAI.Chat.Completions.ChatCompletionTool;
  intent: string;
  handler: ToolHandler;
};

function petRepo() {
  return AppDataSource.getRepository(Pet);
}

/**
 * Animal types soportados (codes del catálogo seed).
 * No se exponen los IDs porque son detalles internos que el LLM no debería ver.
 */
const ANIMAL_TYPE_BY_CODE: Record<string, number> = {
  perro: CatalogIds.animalType.perro,
  gato: CatalogIds.animalType.gato,
  otro: CatalogIds.animalType.otro,
};

async function serializeMinimalPet(pet: Pet) {
  // Vista mínima pensada para el LLM: solo los campos relevantes para responder
  // al usuario. Evitamos enviar todo el row para no quemar tokens.
  const catalog = await getCatalogValuesById();
  const animalType = catalog.get(pet.animalTypeId)?.code ?? null;
  const status = catalog.get(pet.statusId)?.code ?? null;
  const sex = pet.sexId ? catalog.get(pet.sexId)?.code ?? null : null;
  return {
    id: pet.id,
    name: pet.name,
    description: pet.description,
    animalType,
    breed: pet.breed,
    color: pet.color,
    sex,
    ageMonths: pet.ageMonths,
    status,
    location: pet.location,
    date: pet.date,
    contactPhone: pet.contactPhone,
    contactEmail: pet.contactEmail,
    photo: pet.photo,
  };
}

async function findPetsByStatus(params: {
  statusId: number;
  location?: string;
  animalType?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 20);

  const where: any = { statusId: params.statusId };
  if (params.location) where.location = ILike(`%${params.location}%`);
  if (params.animalType) {
    const animalTypeId = ANIMAL_TYPE_BY_CODE[params.animalType.toLowerCase()];
    if (animalTypeId) where.animalTypeId = animalTypeId;
  }

  const pets = await petRepo().find({
    where,
    order: { createdAt: "DESC" },
    take: limit,
  });

  return Promise.all(pets.map(serializeMinimalPet));
}

// --- Tool: listar mascotas perdidas ---
const listLostPets: ToolDefinition = {
  intent: "lost_pet_help",
  schema: {
    type: "function",
    function: {
      name: "listLostPets",
      description:
        "Lista las mascotas reportadas como PERDIDAS. Usar cuando el usuario " +
        "menciona que perdió a su mascota, busca a una mascota perdida, " +
        "o quiere ver el listado de mascotas que otras personas están buscando.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description:
              "Zona, barrio o dirección parcial para filtrar (ej: 'Palermo'). Opcional.",
          },
          animalType: {
            type: "string",
            enum: ["perro", "gato", "otro"],
            description: "Filtrar por tipo de animal. Opcional.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Cantidad máxima de resultados (default 5).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => {
    const pets = await findPetsByStatus({
      statusId: CatalogIds.petStatus.perdido,
      location: args?.location,
      animalType: args?.animalType,
      limit: args?.limit,
    });
    return { count: pets.length, pets };
  },
};

// --- Tool: listar mascotas encontradas ---
const listFoundPets: ToolDefinition = {
  intent: "found_pet_help",
  schema: {
    type: "function",
    function: {
      name: "listFoundPets",
      description:
        "Lista las mascotas reportadas como ENCONTRADAS por otros usuarios. " +
        "Usar cuando alguien busca verificar si su mascota perdida ya fue " +
        "encontrada, o cuando un usuario reporta haber encontrado una.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Zona, barrio o dirección parcial.",
          },
          animalType: {
            type: "string",
            enum: ["perro", "gato", "otro"],
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
          },
        },
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => {
    const pets = await findPetsByStatus({
      statusId: CatalogIds.petStatus.encontrado,
      location: args?.location,
      animalType: args?.animalType,
      limit: args?.limit,
    });
    return { count: pets.length, pets };
  },
};

// --- Tool: listar mascotas en adopción ---
const listAdoptablePets: ToolDefinition = {
  intent: "adoption_help",
  schema: {
    type: "function",
    function: {
      name: "listAdoptablePets",
      description:
        "Lista las mascotas disponibles para ADOPCIÓN. Usar cuando el usuario " +
        "quiere adoptar o ver qué mascotas hay disponibles.",
      parameters: {
        type: "object",
        properties: {
          animalType: {
            type: "string",
            enum: ["perro", "gato", "otro"],
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 20,
          },
        },
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => {
    const pets = await findPetsByStatus({
      statusId: CatalogIds.petStatus.adopcion,
      animalType: args?.animalType,
      limit: args?.limit,
    });
    return { count: pets.length, pets };
  },
};

// --- Tool: detalle de una mascota ---
const getPetDetails: ToolDefinition = {
  intent: "pet_details",
  schema: {
    type: "function",
    function: {
      name: "getPetDetails",
      description:
        "Obtener el detalle completo de una mascota por su ID. Usar cuando " +
        "el usuario quiere saber más sobre una mascota específica.",
      parameters: {
        type: "object",
        properties: {
          petId: {
            type: "string",
            description: "UUID de la mascota.",
          },
        },
        required: ["petId"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => {
    const pet = await petRepo().findOneBy({ id: args.petId });
    if (!pet) return { found: false };
    return { found: true, pet: await serializeMinimalPet(pet) };
  },
};

// --- Tool: requisitos / proceso de adopción ---
const getAdoptionInfo: ToolDefinition = {
  intent: "adoption_help",
  schema: {
    type: "function",
    function: {
      name: "getAdoptionInfo",
      description:
        "Devuelve información estática sobre cómo funciona el proceso de " +
        "adopción en la plataforma (requisitos, pasos). Usar cuando el " +
        "usuario pregunta cómo adoptar, qué necesita o requisitos.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  handler: async () => ({
    process: [
      "Crear una cuenta en la plataforma.",
      "Completar el formulario de adoptante (situación, vivienda, experiencia).",
      "Explorar las mascotas en adopción.",
      "Enviar una solicitud para la mascota elegida.",
      "El equipo evalúa y se contacta para coordinar la entrega.",
    ],
    requirements: [
      "Mayor de 18 años.",
      "Aceptar los términos y condiciones.",
      "Compromiso de cuidado responsable.",
    ],
  }),
};

// --- Tool: registrar interés en reportar una mascota perdida ---
// No crea el Pet en DB (eso requiere fotos + más campos), pero deja al LLM
// recolectar y devolver los datos al usuario con instrucciones para completar
// el reporte en el endpoint formal.
const draftLostPetReport: ToolDefinition = {
  intent: "lost_pet_report_draft",
  schema: {
    type: "function",
    function: {
      name: "draftLostPetReport",
      description:
        "Arma un borrador de reporte de mascota perdida con los datos que el " +
        "usuario haya provisto. NO crea el reporte en la base — solo " +
        "estructura los datos y devuelve los próximos pasos. Usar cuando el " +
        "usuario describe a su mascota perdida con detalles (nombre, raza, " +
        "color, zona, etc).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          animalType: {
            type: "string",
            enum: ["perro", "gato", "otro"],
          },
          breed: { type: "string" },
          color: { type: "string" },
          location: {
            type: "string",
            description: "Zona donde se vio por última vez.",
          },
          date: {
            type: "string",
            description: "Fecha en que se perdió (YYYY-MM-DD o texto libre).",
          },
          description: {
            type: "string",
            description: "Cualquier detalle adicional.",
          },
          contactPhone: { type: "string" },
          contactEmail: { type: "string" },
        },
        required: ["animalType", "location"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => ({
    draft: args,
    next_step:
      "Para publicar el reporte, ingresá a la app y completá el formulario " +
      "de mascota perdida con fotos. El borrador queda registrado en esta " +
      "conversación, pero no se publicó automáticamente.",
  }),
};

export const allTools: ToolDefinition[] = [
  listLostPets,
  listFoundPets,
  listAdoptablePets,
  getPetDetails,
  getAdoptionInfo,
  draftLostPetReport,
];

/** Mapa por nombre para resolver al ejecutar tool calls del LLM. */
export const toolsByName: Record<string, ToolDefinition> = Object.fromEntries(
  allTools.map((t) => [t.schema.function.name, t]),
);

/** Schemas que se envían a OpenAI. */
export const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] =
  allTools.map((t) => t.schema);
