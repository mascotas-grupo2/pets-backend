import type OpenAI from "openai";
import { ILike } from "typeorm";
import { AppDataSource } from "../data-source.js";
import { dbManager } from "../lib/db-context.js";
import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "../lib/catalog-constants.js";
import {
  CatalogValidationError,
  getCatalogValuesById,
} from "../lib/catalog-values.js";
import { createPet } from "../lib/pet-service.js";
import { createAdoptionRequest } from "../lib/adoption-service.js";
import type { UserContext } from "./chatbot.types.js";

export type ToolHandler = (
  args: any,
  userContext?: UserContext,
) => Promise<unknown>;

export type ToolDefinition = {
  schema: OpenAI.Chat.Completions.ChatCompletionTool;
  intent: string;
  requiresAuth?: boolean;
  handler: ToolHandler;
};

function petRepo() {
  return dbManager().getRepository(Pet);
}

const ANIMAL_TYPE_BY_CODE: Record<string, number> = {
  perro: CatalogIds.animalType.perro,
  gato: CatalogIds.animalType.gato,
  otro: CatalogIds.animalType.otro,
};

async function serializeMinimalPet(pet: Pet) {
  const catalog = await getCatalogValuesById();
  return {
    id: pet.id,
    name: pet.name,
    description: pet.description,
    animalType: catalog.get(pet.animalTypeId)?.code ?? null,
    breed: pet.breed,
    color: pet.color,
    sex: pet.sexId ? catalog.get(pet.sexId)?.code ?? null : null,
    ageMonths: pet.ageMonths,
    status: catalog.get(pet.statusId)?.code ?? null,
    location: pet.location,
    date: pet.date,
    contactPhone: pet.contactPhone,
    contactEmail: pet.contactEmail,
    photo: pet.photo,
  };
}

export async function findPetsByStatus(params: {
  statusId: number;
  location?: string;
  animalType?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 20);
  const where: any = {
    statusId: params.statusId,
    reportStatusId: CatalogIds.petReportStatus.activo,
  };
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

const listLostPets: ToolDefinition = {
  intent: "lost_pet_help",
  schema: {
    type: "function",
    function: {
      name: "listLostPets",
      description:
        "Lista las mascotas reportadas como PERDIDAS. Usar cuando el usuario menciona que perdió a su mascota, busca a una mascota perdida, o quiere ver el listado de mascotas que otras personas están buscando.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Zona, barrio o dirección parcial. Opcional." },
          animalType: { type: "string", enum: ["perro", "gato", "otro"] },
          limit: { type: "integer", description: "Máximo 20." },
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

const listFoundPets: ToolDefinition = {
  intent: "found_pet_help",
  schema: {
    type: "function",
    function: {
      name: "listFoundPets",
      description:
        "Lista las mascotas reportadas como ENCONTRADAS por otros usuarios. Usar cuando alguien busca verificar si su mascota perdida ya fue encontrada.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
          animalType: { type: "string", enum: ["perro", "gato", "otro"] },
          limit: { type: "integer", description: "Máximo 20." },
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

const listAdoptablePets: ToolDefinition = {
  intent: "adoption_help",
  schema: {
    type: "function",
    function: {
      name: "listAdoptablePets",
      description: "Lista las mascotas disponibles para ADOPCIÓN.",
      parameters: {
        type: "object",
        properties: {
          animalType: { type: "string", enum: ["perro", "gato", "otro"] },
          limit: { type: "integer", description: "Máximo 20." },
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

const getPetDetails: ToolDefinition = {
  intent: "pet_details",
  schema: {
    type: "function",
    function: {
      name: "getPetDetails",
      description: "Obtener el detalle completo de una mascota por su ID.",
      parameters: {
        type: "object",
        properties: { petId: { type: "string", description: "UUID de la mascota." } },
        required: ["petId"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args) => {
    const pet = await petRepo().findOneBy({
      id: args.petId,
      reportStatusId: CatalogIds.petReportStatus.activo,
    });
    if (!pet) return { found: false };
    return { found: true, pet: await serializeMinimalPet(pet) };
  },
};

const getAdoptionInfo: ToolDefinition = {
  intent: "adoption_help",
  schema: {
    type: "function",
    function: {
      name: "getAdoptionInfo",
      description: "Devuelve información estática sobre cómo funciona el proceso de adopción.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  handler: async () => ({
    process: [
      "Crear una cuenta en la plataforma.",
      "Completar el formulario de adoptante.",
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

const createLostPetReport: ToolDefinition = {
  intent: "lost_pet_report_created",
  requiresAuth: true,
  schema: {
    type: "function",
    function: {
      name: "createLostPetReport",
      description:
        "PERSISTE en la base un reporte de mascota perdida con los datos del usuario autenticado. Datos mínimos: animalType, location, date, description, contactPhone.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          animalType: { type: "string", enum: ["perro", "gato", "otro"] },
          breed: { type: "string" },
          color: { type: "string" },
          sex: { type: "string", enum: ["macho", "hembra"] },
          ageMonths: { type: "integer", minimum: 0 },
          location: { type: "string" },
          date: { type: "string" },
          description: { type: "string" },
          contactPhone: { type: "string" },
          contactEmail: { type: "string" },
          reward: { type: "string" },
          hasCollar: { type: "boolean" },
          microchipped: { type: "boolean" },
        },
        required: ["animalType", "location", "date", "description", "contactPhone"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args, userContext) => {
    if (!userContext) return { error: "auth_required" };
    try {
      const pet = await createPet(
        {
          name: args.name ?? null,
          description: args.description,
          animalType: args.animalType,
          date: args.date,
          location: args.location,
          contactPhone: args.contactPhone,
          contactEmail: args.contactEmail ?? userContext.email ?? "",
          sex: args.sex,
          breed: args.breed,
          color: args.color,
          ageMonths: args.ageMonths,
          hasCollar: args.hasCollar,
          microchipped: args.microchipped,
          reward: args.reward,
        },
        { userId: userContext.userId, defaultStatus: "perdido" },
      );
      return {
        created: true,
        petId: pet.id,
        status: "perdido",
        message: "Reporte creado. Las fotos se agregan desde la app web. Queda pendiente de aprobación.",
      };
    } catch (err) {
      if (err instanceof CatalogValidationError) return { error: "validation_error", message: err.message };
      throw err;
    }
  },
};

const createFoundPetReport: ToolDefinition = {
  intent: "found_pet_report_created",
  requiresAuth: true,
  schema: {
    type: "function",
    function: {
      name: "createFoundPetReport",
      description:
        "PERSISTE en la base un reporte de mascota ENCONTRADA (alguien la encontró en la calle y quiere ayudar a que su dueño la recupere). Datos mínimos: animalType, location, date, description, contactPhone.",
      parameters: {
        type: "object",
        properties: {
          animalType: { type: "string", enum: ["perro", "gato", "otro"] },
          breed: { type: "string" },
          color: { type: "string" },
          sex: { type: "string", enum: ["macho", "hembra"] },
          ageMonths: { type: "integer", minimum: 0 },
          location: { type: "string", description: "Zona donde se encontró." },
          date: { type: "string" },
          description: { type: "string", description: "Descripción física y circunstancias." },
          contactPhone: { type: "string" },
          contactEmail: { type: "string" },
          hasCollar: { type: "boolean" },
          microchipped: { type: "boolean" },
        },
        required: ["animalType", "location", "date", "description", "contactPhone"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args, userContext) => {
    if (!userContext) return { error: "auth_required" };
    try {
      const pet = await createPet(
        {
          name: null,
          description: args.description,
          animalType: args.animalType,
          date: args.date,
          location: args.location,
          contactPhone: args.contactPhone,
          contactEmail: args.contactEmail ?? userContext.email ?? "",
          sex: args.sex,
          breed: args.breed,
          color: args.color,
          ageMonths: args.ageMonths,
          hasCollar: args.hasCollar,
          microchipped: args.microchipped,
        },
        { userId: userContext.userId, defaultStatus: "encontrado" },
      );
      return {
        created: true,
        petId: pet.id,
        status: "encontrado",
        message: "Reporte de mascota encontrada creado. Gracias por ayudar. Las fotos se agregan desde la app web.",
      };
    } catch (err) {
      if (err instanceof CatalogValidationError) return { error: "validation_error", message: err.message };
      throw err;
    }
  },
};

const createAdoption: ToolDefinition = {
  intent: "adoption_request_created",
  requiresAuth: true,
  schema: {
    type: "function",
    function: {
      name: "createAdoptionRequest",
      description:
        "PERSISTE una solicitud de adopción. Solo invocar cuando se tienen TODOS los datos obligatorios y el usuario CONFIRMÓ explícitamente que quiere enviar la solicitud (eso implica aceptar términos).",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          addressLine1: { type: "string" },
          postcode: { type: "string" },
          town: { type: "string" },
          preferredAnimalType: { type: "string", enum: ["perro", "gato", "otro"] },
          petId: { type: "string" },
          experience: { type: "string" },
        },
        required: ["firstName", "lastName", "phone", "addressLine1", "postcode", "town"],
        additionalProperties: false,
      },
    },
  },
  handler: async (args, userContext) => {
    if (!userContext) return { error: "auth_required" };
    try {
      const adoption = await createAdoptionRequest(
        {
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email ?? userContext.email ?? "",
          phone: args.phone,
          addressLine1: args.addressLine1,
          postcode: args.postcode,
          town: args.town,
          preferredAnimalType: args.preferredAnimalType,
          petId: args.petId,
          experience: args.experience,
        },
        { userId: userContext.userId },
      );
      return {
        created: true,
        adoptionId: adoption.id,
        message: "Solicitud enviada. El resto del formulario se puede completar desde la app web. El equipo se va a contactar pronto.",
      };
    } catch (err) {
      if (err instanceof CatalogValidationError) return { error: "validation_error", message: err.message };
      throw err;
    }
  },
};


export const allTools: ToolDefinition[] = [
  listLostPets,
  listFoundPets,
  listAdoptablePets,
  getPetDetails,
  getAdoptionInfo,
  createLostPetReport,
  createFoundPetReport,
  createAdoption,
];

export const toolsByName: Record<string, ToolDefinition> = Object.fromEntries(
  allTools.map((t) => [t.schema.function.name, t]),
);

export const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] =
  allTools.map((t) => t.schema);
