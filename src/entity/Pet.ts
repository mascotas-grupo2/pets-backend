import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum AnimalType {
  PERRO = "perro",
  GATO = "gato",
  OTRO = "otro",
}

export enum PetSex {
  MACHO = "macho",
  HEMBRA = "hembra",
}

export enum PetStatus {
  PERDIDO = "perdido",
  ENCONTRADO = "encontrado",
  TRANSITO = "en tránsito",
  MEDICO = "en tratamiento médico",
  ADOPCION = "en adopción",
  ADOPTADO = "adoptado",
}

export enum PetMedicalStatus {
  SANO = "sano",
  EVALUACION = "en evaluación",
  TRATAMIENTO = "en tratamiento",
  POST_OPERATORIO = "post-operatorio",
  RECUPERANDOSE = "recuperándose",
  CRITICO = "crítico",
}

@Entity("pet")
export class Pet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ nullable: true, type: "varchar", length: 120 })
  name: string | null;

  @Column({ nullable: true, type: "text" })
  photo: string | null;

  @Column({ type: "text", array: true, nullable: true })
  photos: string[] | null;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: AnimalType })
  animalType: AnimalType;

  @Column({ type: "varchar", length: 200 })
  date: string;

  @Column({ type: "varchar", length: 200 })
  location: string;

  @Column({ nullable: true, type: "float" })
  latitud: number | null;

  @Column({ nullable: true, type: "float" })
  longitud: number | null;

  @Column({ type: "varchar", length: 30 })
  contactPhone: string;

  @Column({ type: "varchar", length: 120 })
  contactEmail: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, type: "enum", enum: PetSex })
  sex: PetSex | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  breed: string | null;

  @Column({ nullable: true, type: "int" })
  ageMonths: number | null;

  @Column({ nullable: true, type: "varchar", length: 80 })
  color: string | null;

  @Column({ nullable: true, type: "float" })
  weightKg: number | null;

  @Column({ nullable: true, type: "float" })
  heightCm: number | null;

  @Column({ nullable: true, type: "boolean" })
  hasCollar: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  hasTag: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  microchipped: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  neutered: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  vaccinated: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  friendlyWithKids: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  trained: boolean | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  reward: string | null;

  @Column({ nullable: true, type: "int" })
  userId: number | null;

  @Column({ type: "enum", enum: PetStatus, default: PetStatus.PERDIDO })
  status: PetStatus;

  @Column({
    type: "enum",
    enum: PetMedicalStatus,
    default: PetMedicalStatus.SANO,
  })
  medicalStatus: PetMedicalStatus;
}
