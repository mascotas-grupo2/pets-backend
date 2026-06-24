import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";
import { CatalogIds } from "../lib/catalog-constants.js";

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

  @Column({ type: "int" })
  animalTypeId: number;

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

  /** Cuándo vence la publicación. Null = sin vencimiento (estados terminales). */
  @Column({ nullable: true, type: "timestamp" })
  expiresAt: Date | null;

  /** Cuándo se avisó del vencimiento (para no notificar dos veces). Se resetea al renovar. */
  @Column({ nullable: true, type: "timestamp" })
  expiryNotifiedAt: Date | null;

  /** Cuándo se avisó que ESTÁ POR vencer (aviso previo). Se resetea al renovar. */
  @Column({ nullable: true, type: "timestamp" })
  expiryWarnedAt: Date | null;

  @Column({ nullable: true, type: "int" })
  sexId: number | null;

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
  friendlyWithPets: boolean | null;

  @Column({ nullable: true, type: "int" })
  activityLevelId: number | null;

  @Column({ nullable: true, type: "boolean" })
  trained: boolean | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  reward: string | null;

  @Column({ nullable: true, type: "int" })
  userId: number | null;

  @Column({ type: "int", default: CatalogIds.petStatus.perdido })
  statusId: number;

  @Column({ type: "int", default: CatalogIds.petMedicalStatus.sano })
  medicalStatusId: number;

  @Column({ type: "int", default: CatalogIds.petReportStatus.pendiente })
  reportStatusId: number;

  // Conteo de vistas del detalle público (se incrementa al verlo un tercero).
  @Column({ type: "int", default: 0 })
  viewsCount: number;

  /** true = un dueño fue verificado por el admin vía approveClaim. */
  @Column({ type: "boolean", default: false })
  isOwner: boolean;

  /** ID del usuario verificado como dueño (distinto del publicador original userId).
   *  Se asigna en approveClaim. El publicador original sigue siendo userId. */
  @Column({ nullable: true, type: "int" })
  ownerUserId: number | null;
}
