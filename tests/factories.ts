import { CatalogIds } from "../src/lib/catalog-constants.js";
import type { Pet } from "../src/entity/Pet.js";
import type { PetNote } from "../src/entity/PetNote.js";
import type { User } from "../src/entity/User.js";
import type { Adoption } from "../src/entity/Adoption.js";

export function makePet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: "abc-123",
    name: "Firulais",
    photo: null,
    photos: null,
    description: "Perro mediano marron",
    animalTypeId: CatalogIds.animalType.perro,
    date: "2026-01-10",
    location: "Palermo, CABA",
    latitud: null,
    longitud: null,
    contactPhone: "1112345678",
    contactEmail: "owner@example.com",
    createdAt: new Date("2026-01-10T00:00:00Z"),
    sexId: CatalogIds.petSex.macho,
    breed: null,
    ageMonths: null,
    color: null,
    weightKg: null,
    heightCm: null,
    hasCollar: null,
    hasTag: null,
    microchipped: null,
    neutered: null,
    vaccinated: null,
    friendlyWithKids: null,
    trained: null,
    reward: null,
    userId: 5,
    statusId: CatalogIds.petStatus.perdido,
    medicalStatusId: CatalogIds.petMedicalStatus.sano,
    reportStatusId: CatalogIds.petReportStatus.activo,
    ...overrides,
  } as Pet;
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 5,
    name: "Juan Perez",
    email: "juan@example.com",
    passwordHash: "hash",
    passwordSalt: "salt",
    refreshTokenHash: null,
    emailVerified: true,
    emailVerificationTokenHash: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    ssoProviderId: null,
    ssoSubject: null,
    roleId: CatalogIds.userRole.user,
    adopter: false,
    photo: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as User;
}

export function makePetNote(overrides: Partial<PetNote> = {}): PetNote {
  return {
    id: 1,
    petId: "abc-123",
    kindId: CatalogIds.petNoteKind.general,
    text: "Una nota",
    authorId: 1,
    authorName: "Admin",
    createdAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  } as PetNote;
}

export function makeAdoption(overrides: Partial<Adoption> = {}): Adoption {
  return {
    id: 1,
    userId: 5,
    petId: null,
    statusId: CatalogIds.adoptionStatus.nueva,
    compatibilityScore: null,
    preferredAnimalTypeId: CatalogIds.animalType.perro,
    firstName: "Juan",
    lastName: "Perez",
    email: "juan@example.com",
    phone: "1112345678",
    addressLine1: "Av. Siempreviva 742",
    addressLine2: null,
    postcode: "1414",
    town: "CABA",
    hasGardenId: CatalogIds.yesNo.si,
    livingSituationId: CatalogIds.livingSituation.casa,
    householdSettingId: CatalogIds.householdSetting.urbano,
    activityLevelId: CatalogIds.activityLevel.moderado,
    adults: 2,
    children: 1,
    visitingChildrenId: CatalogIds.yesNo.no,
    hasFlatmatesId: CatalogIds.yesNo.no,
    allergies: null,
    otherAnimalsId: CatalogIds.yesNo.no,
    otherAnimalsDetail: null,
    neuteredId: CatalogIds.yesNoNA.na,
    vaccinatedId: CatalogIds.yesNoNA.si,
    experience: null,
    acceptsTerms: true,
    createdAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  } as Adoption;
}
