import { ChatIntent } from "./chat.types.js";

export const chatIntents: ChatIntent[] = [
    //Lost Pet
  {
    id: "lost_pet_help",
    triggers: [
      "perdi",
      "se escapo",
      "mascota perdida",
      "no encuentro",
    ],
    response: {
      text: "Lamento que estés pasando por eso. Te recomiendo publicar un reporte con foto clara, zona, fecha y teléfono de contacto. Recorda revisar los reportes de mascotas encontradas para ver si alguien ya encontró tus huellitas.",
      quickReplies: [
        { label: "Crear reporte", value: "create_report" },
        { label: "Ver mascotas", value: "view_lost_pets" },
      ],
    },
  },
   //Found Pet
  {
    id: "found_pet_help",
    triggers: [
      "encontre",
      "encontrada",
      "vi este"
    ],
    response: {
      text: "Muchísimas gracias por querer ayudar reportando la mascota encontrada. Te recomiendo publicar un reporte con foto clara, zona, fecha y teléfono de contacto. También si podés revisá los reportes actuales para ver si alguien la está buscando o si ya fue reportada.",
      quickReplies: [
        { label: "Crear reporte", value: "create_report" },
        { label: "Ver mascotas", value: "view_lost_pets" },
      ],
    },
  },
    //Adoption
  {
    id: "adoption_help",
    triggers: [
      "quiero adoptar",
      "como adopto",
      "adoptar mascota",
      "requisitos para adoptar",
    ],
    response: {
      text: "Para adoptar, primero completá tu perfil de adoptante. Después vas a poder ver mascotas disponibles y avanzar con una solicitud.",
      quickReplies: [
        { label: "Completar perfil", value: "adoption_form" },
        { label: "Ver mascotas", value: "view_pets" },
      ],
    },
  },
];
