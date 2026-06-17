import { Adoption } from "../entity/Adoption.js";
import { Pet } from "../entity/Pet.js";
import { CatalogIds } from "./catalog-constants.js";

export type CompatibilityFactor = {
  criteria: string;
  applicantValue: string;
  petValue: string;
  scoreImpact: number;
  isPositive: boolean;
  label: string;
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
  let score = 0; // Puntaje base de 0
  const factors: CompatibilityFactor[] = [];

  // Regla eliminatoria: Alergias
  if (adoption.allergies && adoption.allergies.trim().length > 0) {
    factors.push({ 
      criteria: "Alergias", applicantValue: "Reporta tener alergias", petValue: "N/A", scoreImpact: -50, isPositive: false, label: "Posibles alergias del solicitante"
    });
    return { score: 0, factors };
  } else {
    factors.push({
      criteria: "Alergias", applicantValue: "Sin alergias", petValue: "N/A", scoreImpact: 0, isPositive: true, label: "Sin reporte de alergias"
    });
  }

  // 1. Compatibilidad con niños (Max 20)
  const hasKids = (adoption.children && adoption.children > 0) || 
                  (adoption.visitingChildrenId === CatalogIds.yesNo.si);
                  
  if (hasKids) {
    if (pet.friendlyWithKids === true) {
      score += 20;
      factors.push({ criteria: "Niños en el hogar", applicantValue: "Tiene niños o recibe visitas", petValue: "Amigable con niños", scoreImpact: 20, isPositive: true, label: "Mascota amigable con niños" });
    } else if (pet.friendlyWithKids === false) {
      factors.push({ criteria: "Niños en el hogar", applicantValue: "Tiene niños o recibe visitas", petValue: "No apta para niños", scoreImpact: 0, isPositive: false, label: "Mascota no apta para niños" });
    } else {
      score += 10;
      factors.push({ criteria: "Niños en el hogar", applicantValue: "Tiene niños o recibe visitas", petValue: "Sin datos", scoreImpact: 10, isPositive: true, label: "Sin datos de convivencia con niños" });
    }
  } else {
    score += 20;
    factors.push({ criteria: "Niños en el hogar", applicantValue: "Sin niños", petValue: "N/A", scoreImpact: 20, isPositive: true, label: "Sin niños en el hogar" });
  }

  // 2. Espacio y Vivienda (Max 20)
  const isDog = pet.animalTypeId === CatalogIds.animalType.perro;
  const isLarge = pet.weightKg ? pet.weightKg > 15 : false; 
  const hasGarden = adoption.hasGardenId === CatalogIds.yesNo.si;
  const isFlat = adoption.livingSituationId === CatalogIds.livingSituation.departamento;

  if (isDog && isLarge) {
    if (hasGarden) {
      score += 20;
      factors.push({ criteria: "Espacio y Vivienda", applicantValue: "Tiene jardín", petValue: "Perro grande (>15kg)", scoreImpact: 20, isPositive: true, label: "Hogar con espacio adecuado" });
    } else {
      factors.push({ criteria: "Espacio y Vivienda", applicantValue: "No tiene jardín", petValue: "Perro grande (>15kg)", scoreImpact: 0, isPositive: false, label: "Falta de espacio para perro grande" });
    }
  } else if (!isDog || !isLarge) {
    if (isFlat) {
      score += 20;
      factors.push({ criteria: "Espacio y Vivienda", applicantValue: "Vive en departamento", petValue: isDog ? "Perro pequeño/mediano" : "Gato u otro", scoreImpact: 20, isPositive: true, label: "Mascota adaptable a departamento" });
    } else {
      score += 20;
      factors.push({ criteria: "Espacio y Vivienda", applicantValue: hasGarden ? "Tiene jardín" : "No es departamento", petValue: isDog ? "Perro pequeño/mediano" : "Gato u otro", scoreImpact: 20, isPositive: true, label: "Espacio adecuado" });
    }
  }

  // 3. Nivel de Actividad (Max 20)
  const adoptionActivityLabel = adoption.activityLevelId === CatalogIds.activityLevel.activo ? "Activo" : adoption.activityLevelId === CatalogIds.activityLevel.tranquilo ? "Tranquilo" : "Medio";
  const petActivityLabel = pet.activityLevelId === CatalogIds.activityLevel.activo ? "Activo" : pet.activityLevelId === CatalogIds.activityLevel.tranquilo ? "Tranquilo" : "Medio/Sin asignar";

  if (pet.activityLevelId && adoption.activityLevelId) {
    if (pet.activityLevelId === adoption.activityLevelId) {
      score += 20;
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: petActivityLabel, scoreImpact: 20, isPositive: true, label: "Mismo nivel de actividad" });
    } else if (
      (pet.activityLevelId === CatalogIds.activityLevel.activo && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) ||
      (pet.activityLevelId === CatalogIds.activityLevel.tranquilo && adoption.activityLevelId === CatalogIds.activityLevel.activo)
    ) {
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: petActivityLabel, scoreImpact: 0, isPositive: false, label: "Nivel de actividad incompatible" });
    } else {
       score += 10;
       factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: petActivityLabel, scoreImpact: 10, isPositive: true, label: "Actividad aceptable" });
    }
  } else if (adoption.activityLevelId) {
    const isYoung = pet.ageMonths != null && pet.ageMonths < 24;
    const isSenior = pet.ageMonths != null && pet.ageMonths > 84;
    
    if (isYoung && adoption.activityLevelId === CatalogIds.activityLevel.activo) {
      score += 20;
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: "Mascota joven (< 2 años)", scoreImpact: 20, isPositive: true, label: "Nivel de actividad adecuado para mascota joven" });
    }
    else if (isYoung && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) {
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: "Mascota joven (< 2 años)", scoreImpact: 0, isPositive: false, label: "Actividad insuficiente para mascota joven" });
    }
    else if (isSenior && adoption.activityLevelId === CatalogIds.activityLevel.tranquilo) {
      score += 20;
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: "Mascota mayor (> 7 años)", scoreImpact: 20, isPositive: true, label: "Ambiente tranquilo adecuado para mascota mayor" });
    } else {
      score += 10;
      factors.push({ criteria: "Nivel de Actividad", applicantValue: adoptionActivityLabel, petValue: "Sin datos específicos / edad media", scoreImpact: 10, isPositive: true, label: "Actividad aceptable" });
    }
  } else {
     score += 10;
     factors.push({ criteria: "Nivel de Actividad", applicantValue: "Sin datos", petValue: petActivityLabel, scoreImpact: 10, isPositive: true, label: "Sin datos de actividad" });
  }

  // 4. Convivencia con otros animales (Max 20)
  const hasOtherAnimals = adoption.otherAnimalsId === CatalogIds.yesNo.si;
  if (hasOtherAnimals) {
    if (pet.friendlyWithPets === false) {
      factors.push({ criteria: "Otras mascotas (Amigabilidad)", applicantValue: "Tiene otras mascotas", petValue: "No apta con otros animales", scoreImpact: 0, isPositive: false, label: "Mascota no apta con otros animales" });
    } else if (pet.friendlyWithPets === true) {
      score += 10;
      factors.push({ criteria: "Otras mascotas (Amigabilidad)", applicantValue: "Tiene otras mascotas", petValue: "Amigable con otros animales", scoreImpact: 10, isPositive: true, label: "Mascota amigable con otros animales" });
    } else {
      score += 5;
      factors.push({ criteria: "Otras mascotas (Amigabilidad)", applicantValue: "Tiene otras mascotas", petValue: "Sin datos", scoreImpact: 5, isPositive: true, label: "Sin datos de convivencia con mascotas" });
    }

    const allNeutered = adoption.neuteredId === CatalogIds.yesNoNA.si;
    const allVaccinated = adoption.vaccinatedId === CatalogIds.yesNoNA.si;

    if (allNeutered && allVaccinated) {
      score += 10;
      factors.push({ criteria: "Otras mascotas (Salud)", applicantValue: "Mascotas vacunadas y castradas", petValue: "N/A", scoreImpact: 10, isPositive: true, label: "Otras mascotas al día" });
    } else if (adoption.neuteredId === CatalogIds.yesNoNA.no || adoption.vaccinatedId === CatalogIds.yesNoNA.no) {
      factors.push({ criteria: "Otras mascotas (Salud)", applicantValue: "Falta vacunas o castración", petValue: "N/A", scoreImpact: 0, isPositive: false, label: "Otras mascotas no están al día" });
    } else {
      score += 5;
      factors.push({ criteria: "Otras mascotas (Salud)", applicantValue: "Información incompleta de salud", petValue: "N/A", scoreImpact: 5, isPositive: true, label: "Estado de salud de otras mascotas incierto" });
    }
  } else {
    score += 20;
    factors.push({ criteria: "Otras mascotas", applicantValue: "Sin otras mascotas", petValue: "N/A", scoreImpact: 20, isPositive: true, label: "Sin otras mascotas en casa" });
  }

  // 5. Experiencia Previa (Max 20)
  const hasExperience = adoption.experience && adoption.experience.trim().length > 0;
  const needsTraining = pet.trained === false;
  const hasMedicalCondition = pet.medicalStatusId !== CatalogIds.petMedicalStatus.sano;

  if (needsTraining || hasMedicalCondition) {
    const petValue = (needsTraining && hasMedicalCondition) ? "Necesita entrenamiento y cuidados médicos" : (needsTraining ? "Necesita entrenamiento" : "Condición médica");
    if (hasExperience) {
      score += 20;
      factors.push({ criteria: "Experiencia Previa", applicantValue: "Tiene experiencia", petValue, scoreImpact: 20, isPositive: true, label: "Solicitante con experiencia previa" });
    } else {
      factors.push({ criteria: "Experiencia Previa", applicantValue: "No tiene experiencia", petValue, scoreImpact: 0, isPositive: false, label: "Falta experiencia para necesidades especiales" });
    }
  } else {
    if (hasExperience) {
      score += 20;
      factors.push({ criteria: "Experiencia Previa", applicantValue: "Tiene experiencia", petValue: "Sin necesidades especiales", scoreImpact: 20, isPositive: true, label: "Solicitante con experiencia previa" });
    } else {
       score += 20;
       factors.push({ criteria: "Experiencia Previa", applicantValue: "Sin experiencia", petValue: "Sin necesidades especiales", scoreImpact: 20, isPositive: true, label: "Sin experiencia previa (no requerida)" });
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    factors
  };
}

