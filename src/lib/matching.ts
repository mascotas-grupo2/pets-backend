import { Adoption } from "../entity/Adoption.js";
import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "./catalog-constants.js";

export type CompatibilityFactor = {
  label: string;
  isPositive: boolean;
};

export type CompatibilityResult = {
  score: number;
  factors: CompatibilityFactor[];
};

/**
 * Calcula un puntaje de compatibilidad entre un formulario de adopción y una mascota.
 * Devuelve un objeto con el puntaje entre 0 y 100 y los factores analizados.
 */
export function calculateCompatibility(adoption: Adoption, pet: Pet): CompatibilityResult {
  let score = 50; // Puntaje base neutral
  const factors: CompatibilityFactor[] = [];

  // Regla eliminatoria: Alergias
  if (adoption.allergies && adoption.allergies.trim().length > 0) {
    factors.push({ label: "Posibles alergias del solicitante", isPositive: false });
    return { score: 0, factors };
  } else {
    factors.push({ label: "Sin reporte de alergias", isPositive: true });
  }

  // 1. Compatibilidad con niños
  const hasKids = (adoption.children && adoption.children > 0) || 
                  (adoption.visitingChildrenId === CatalogIds.yesNo.si);
                  
  if (hasKids) {
    if (pet.friendlyWithKids === true) {
      score += 20;
      factors.push({ label: "Mascota amigable con niños", isPositive: true });
    } else if (pet.friendlyWithKids === false) {
      score -= 30;
      factors.push({ label: "Mascota no apta para niños", isPositive: false });
    }
  } else {
    factors.push({ label: "Sin niños en el hogar", isPositive: true });
  }

  // 2. Espacio y Vivienda
  const isDog = pet.animalTypeId === CatalogIds.animalType.perro;
  const isLarge = pet.weightKg ? pet.weightKg > 15 : false; 
  const hasGarden = adoption.hasGardenId === CatalogIds.yesNo.si;
  const isFlat = adoption.livingSituationId === CatalogIds.livingSituation.departamento;

  if (isDog && isLarge) {
    if (hasGarden) {
      score += 15;
      factors.push({ label: "Hogar con espacio adecuado", isPositive: true });
    } else {
      score -= 20;
      factors.push({ label: "Falta de espacio para perro grande", isPositive: false });
    }
  } else if (!isDog || !isLarge) {
    if (isFlat) {
      score += 10;
      factors.push({ label: "Mascota adaptable a departamento", isPositive: true });
    }
  }

  // 3. Nivel de Actividad
  if (pet.activityLevelId && adoption.activityLevelId) {
    if (pet.activityLevelId === adoption.activityLevelId) {
      score += 15;
      factors.push({ label: "Mismo nivel de actividad", isPositive: true });
    } else if (
      (pet.activityLevelId === CatalogIds.activityLevel.activo && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) ||
      (pet.activityLevelId === CatalogIds.activityLevel.tranquilo && adoption.activityLevelId === CatalogIds.activityLevel.activo)
    ) {
      score -= 20;
      factors.push({ label: "Nivel de actividad incompatible", isPositive: false });
    }
  } else if (adoption.activityLevelId) {
    const isYoung = pet.ageMonths != null && pet.ageMonths < 24;
    const isSenior = pet.ageMonths != null && pet.ageMonths > 84;

    if (isYoung && adoption.activityLevelId === CatalogIds.activityLevel.activo) {
      score += 15;
      factors.push({ label: "Nivel de actividad adecuado para mascota joven", isPositive: true });
    }
    if (isYoung && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) {
      score -= 20;
      factors.push({ label: "Actividad insuficiente para mascota joven", isPositive: false });
    }
    if (isSenior && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) {
      score += 15;
      factors.push({ label: "Ambiente tranquilo adecuado para mascota mayor", isPositive: true });
    }
  }

  // 4. Convivencia con otros animales
  const hasOtherAnimals = adoption.otherAnimalsId === CatalogIds.yesNo.si;
  if (hasOtherAnimals) {
    if (pet.friendlyWithPets === false) {
      score -= 30;
      factors.push({ label: "Mascota no apta con otros animales", isPositive: false });
    } else if (pet.friendlyWithPets === true) {
      score += 10;
      factors.push({ label: "Mascota amigable con otros animales", isPositive: true });
    }

    const allNeutered = adoption.neuteredId === CatalogIds.yesNoNA.si;
    const allVaccinated = adoption.vaccinatedId === CatalogIds.yesNoNA.si;

    if (allNeutered && allVaccinated) {
      score += 10;
      factors.push({ label: "Otras mascotas vacunadas y castradas", isPositive: true });
    } else if (adoption.neuteredId === CatalogIds.yesNoNA.no || adoption.vaccinatedId === CatalogIds.yesNoNA.no) {
      score -= 20;
      factors.push({ label: "Otras mascotas no están al día con controles", isPositive: false });
    }
  } else {
    factors.push({ label: "Sin otras mascotas en casa", isPositive: true });
  }

  // 5. Experiencia Previa
  const hasExperience = adoption.experience && adoption.experience.trim().length > 0;
  const needsTraining = pet.trained === false;
  const hasMedicalCondition = pet.medicalStatusId !== CatalogIds.petMedicalStatus.sano;

  if (needsTraining || hasMedicalCondition) {
    if (hasExperience) {
      score += 10;
      factors.push({ label: "Solicitante con experiencia previa", isPositive: true });
    } else {
      score -= 10;
      factors.push({ label: "Falta experiencia para mascota con necesidades especiales", isPositive: false });
    }
  } else {
    if (hasExperience) {
      factors.push({ label: "Solicitante con experiencia previa", isPositive: true });
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    factors
  };
}
