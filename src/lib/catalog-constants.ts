export const Catalog = {
  ANIMAL_TYPE: "animal_type",
  PET_SEX: "pet_sex",
  PET_STATUS: "pet_status",
  PET_MEDICAL_STATUS: "pet_medical_status",
  PET_NOTE_KIND: "pet_note_kind",
  PET_REPORT_STATUS: "pet_report_status",
  ADOPTION_STATUS: "adoption_status",
  FOLLOWUP_TYPE: "followup_type",
  FOLLOWUP_STATUS: "followup_status",
  USER_ROLE: "user_role",
  SSO_PROVIDER: "sso_provider",
  YES_NO: "yes_no",
  YES_NO_NA: "yes_no_na",
  LIVING_SITUATION: "living_situation",
  HOUSEHOLD_SETTING: "household_setting",
  ACTIVITY_LEVEL: "activity_level",
  USER_STATUS: "user_status",
} as const;

export const CatalogIds = {
  animalType: {
    perro: 1,
    gato: 2,
    otro: 3,
  },
  petSex: {
    macho: 101,
    hembra: 102,
  },
  petStatus: {
    perdido: 201,
    encontrado: 202,
    transito: 203,
    medico: 204,
    adopcion: 205,
    adoptado: 206,
  },
  petMedicalStatus: {
    sano: 301,
    evaluacion: 302,
    tratamiento: 303,
    postOperatorio: 304,
    recuperandose: 305,
    critico: 306,
  },
  petNoteKind: {
    general: 401,
    medica: 402,
    adopcion: 403,
  },
  userRole: {
    user: 501,
    admin: 502,
  },
  userStatus: {
    activo: 511,
    enEvaluacion: 512,
    bloqueado: 513,
  },
  ssoProvider: {
    keycloak: 601,
  },
  yesNo: {
    si: 701,
    no: 702,
  },
  yesNoNA: {
    si: 711,
    no: 712,
    na: 713,
  },
  livingSituation: {
    casa: 801,
    departamento: 802,
    phd: 803,
    quinta: 804,
    otro: 805,
  },
  householdSetting: {
    urbano: 901,
    suburbano: 902,
    rural: 903,
  },
  activityLevel: {
    tranquilo: 1001,
    moderado: 1002,
    activo: 1003,
  },
  petReportStatus: {
    pendiente: 1101,
    activo: 1102,
    finalizado: 1103,
    rechazado: 1104,
    reservada: 1105,
  },
  adoptionStatus: {
    nueva: 1201,
    enEvaluacion: 1202,
    entrevistaPendiente: 1203,
    aceptadaConSeguimiento: 1204,
    aceptada: 1205,
    descartada: 1206,
  },
  followupType: {
    programado: 1301,
    medico: 1302,
    visita: 1303,
    urgente: 1304,
    control: 1305,
    postAdopcion: 1306,
  },
  followupStatus: {
    pendiente: 1311,
    confirmado: 1312,
  },
} as const;

export type CatalogName = (typeof Catalog)[keyof typeof Catalog];

export type CatalogSeedItem = {
  id: number;
  catalog: CatalogName;
  code: string;
  label: string;
};

export const CatalogSeed: CatalogSeedItem[] = [
  { id: 1, catalog: Catalog.ANIMAL_TYPE, code: "perro", label: "Perro" },
  { id: 2, catalog: Catalog.ANIMAL_TYPE, code: "gato", label: "Gato" },
  { id: 3, catalog: Catalog.ANIMAL_TYPE, code: "otro", label: "Otro" },

  { id: 101, catalog: Catalog.PET_SEX, code: "macho", label: "Macho" },
  { id: 102, catalog: Catalog.PET_SEX, code: "hembra", label: "Hembra" },

  { id: 201, catalog: Catalog.PET_STATUS, code: "perdido", label: "Perdido" },
  { id: 202, catalog: Catalog.PET_STATUS, code: "encontrado", label: "Encontrado" },
  { id: 203, catalog: Catalog.PET_STATUS, code: "en tránsito", label: "En tránsito" },
  { id: 204, catalog: Catalog.PET_STATUS, code: "en tratamiento médico", label: "En tratamiento médico" },
  { id: 205, catalog: Catalog.PET_STATUS, code: "en adopción", label: "En adopción" },
  { id: 206, catalog: Catalog.PET_STATUS, code: "adoptado", label: "Adoptado" },

  { id: 301, catalog: Catalog.PET_MEDICAL_STATUS, code: "sano", label: "Sano" },
  { id: 302, catalog: Catalog.PET_MEDICAL_STATUS, code: "en evaluación", label: "En evaluación" },
  { id: 303, catalog: Catalog.PET_MEDICAL_STATUS, code: "en tratamiento", label: "En tratamiento" },
  { id: 304, catalog: Catalog.PET_MEDICAL_STATUS, code: "post-operatorio", label: "Post-operatorio" },
  { id: 305, catalog: Catalog.PET_MEDICAL_STATUS, code: "recuperándose", label: "Recuperándose" },
  { id: 306, catalog: Catalog.PET_MEDICAL_STATUS, code: "crítico", label: "Crítico" },

  { id: 401, catalog: Catalog.PET_NOTE_KIND, code: "general", label: "General" },
  { id: 402, catalog: Catalog.PET_NOTE_KIND, code: "medica", label: "Médica" },
  { id: 403, catalog: Catalog.PET_NOTE_KIND, code: "adopcion", label: "Adopción" },

  { id: 501, catalog: Catalog.USER_ROLE, code: "user", label: "Usuario" },
  { id: 502, catalog: Catalog.USER_ROLE, code: "admin", label: "Administrador" },

  { id: 511, catalog: Catalog.USER_STATUS, code: "activo", label: "Activo" },
  { id: 512, catalog: Catalog.USER_STATUS, code: "evaluacion", label: "En evaluación" },
  { id: 513, catalog: Catalog.USER_STATUS, code: "bloqueado", label: "Bloqueado" },

  { id: 601, catalog: Catalog.SSO_PROVIDER, code: "keycloak", label: "Keycloak" },

  { id: 701, catalog: Catalog.YES_NO, code: "si", label: "Si" },
  { id: 702, catalog: Catalog.YES_NO, code: "no", label: "No" },

  { id: 711, catalog: Catalog.YES_NO_NA, code: "si", label: "Si" },
  { id: 712, catalog: Catalog.YES_NO_NA, code: "no", label: "No" },
  { id: 713, catalog: Catalog.YES_NO_NA, code: "na", label: "No aplica" },

  { id: 801, catalog: Catalog.LIVING_SITUATION, code: "casa", label: "Casa" },
  { id: 802, catalog: Catalog.LIVING_SITUATION, code: "departamento", label: "Departamento" },
  { id: 803, catalog: Catalog.LIVING_SITUATION, code: "phd", label: "PHD" },
  { id: 804, catalog: Catalog.LIVING_SITUATION, code: "quinta", label: "Quinta" },
  { id: 805, catalog: Catalog.LIVING_SITUATION, code: "otro", label: "Otro" },

  { id: 901, catalog: Catalog.HOUSEHOLD_SETTING, code: "urbano", label: "Urbano" },
  { id: 902, catalog: Catalog.HOUSEHOLD_SETTING, code: "suburbano", label: "Suburbano" },
  { id: 903, catalog: Catalog.HOUSEHOLD_SETTING, code: "rural", label: "Rural" },

  { id: 1001, catalog: Catalog.ACTIVITY_LEVEL, code: "tranquilo", label: "Tranquilo" },
  { id: 1002, catalog: Catalog.ACTIVITY_LEVEL, code: "moderado", label: "Moderado" },
  { id: 1003, catalog: Catalog.ACTIVITY_LEVEL, code: "activo", label: "Activo" },
  { id: 1101, catalog: Catalog.PET_REPORT_STATUS, code: "pendiente", label: "Pendiente" },
  { id: 1102, catalog: Catalog.PET_REPORT_STATUS, code: "activo", label: "Activo" },
  { id: 1103, catalog: Catalog.PET_REPORT_STATUS, code: "finalizado", label: "Finalizado" },
  { id: 1104, catalog: Catalog.PET_REPORT_STATUS, code: "rechazado", label: "Rechazado" },

  { id: 1201, catalog: Catalog.ADOPTION_STATUS, code: "NUEVA", label: "Nueva" },
  { id: 1202, catalog: Catalog.ADOPTION_STATUS, code: "EN_EVALUACION", label: "En evaluacion" },
  { id: 1203, catalog: Catalog.ADOPTION_STATUS, code: "ENTREVISTA_PENDIENTE", label: "Entrevista pendiente" },
  { id: 1204, catalog: Catalog.ADOPTION_STATUS, code: "ACEPTADA_CON_SEGUIMIENTO", label: "Aceptada con seguimiento" },
  { id: 1205, catalog: Catalog.ADOPTION_STATUS, code: "ACEPTADA", label: "Aceptada" },
  { id: 1206, catalog: Catalog.ADOPTION_STATUS, code: "DESCARTADA", label: "Descartada" },

  { id: 1301, catalog: Catalog.FOLLOWUP_TYPE, code: "PROGRAMADO", label: "Programado" },
  { id: 1302, catalog: Catalog.FOLLOWUP_TYPE, code: "MEDICO", label: "Medico" },
  { id: 1303, catalog: Catalog.FOLLOWUP_TYPE, code: "VISITA", label: "Visita" },
  { id: 1304, catalog: Catalog.FOLLOWUP_TYPE, code: "URGENTE", label: "Urgente" },
  { id: 1305, catalog: Catalog.FOLLOWUP_TYPE, code: "CONTROL", label: "Control" },
  { id: 1306, catalog: Catalog.FOLLOWUP_TYPE, code: "POST_ADOPCION", label: "Post adopcion" },

  { id: 1311, catalog: Catalog.FOLLOWUP_STATUS, code: "PENDIENTE", label: "Pendiente" },
  { id: 1312, catalog: Catalog.FOLLOWUP_STATUS, code: "CONFIRMADO", label: "Confirmado" },
];

const byId = new Map(CatalogSeed.map((item) => [item.id, item]));
const byCatalogAndCode = new Map(
  CatalogSeed.map((item) => [`${item.catalog}:${item.code.toLowerCase()}`, item]),
);

export function catalogCodeForId(id: number | null | undefined) {
  return id ? byId.get(id)?.code ?? null : null;
}

export function catalogItemForId(id: number | null | undefined) {
  return id ? byId.get(id) ?? null : null;
}

export function catalogIdForCode(catalog: CatalogName, code: string | null | undefined) {
  if (!code) return null;
  return byCatalogAndCode.get(`${catalog}:${code.trim().toLowerCase()}`)?.id ?? null;
}
