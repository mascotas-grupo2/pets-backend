import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class Adoption {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", nullable: true })
  userId!: number | null;

  @Column({ type: "uuid", nullable: true })
  petId!: string | null;

  @Column({ type: "int", nullable: true })
  preferredAnimalTypeId!: number | null;

  @Column({ type: "varchar", length: 120 })
  firstName!: string;

  @Column({ type: "varchar", length: 120 })
  lastName!: string;

  @Column({ type: "varchar", length: 200 })
  email!: string;

  @Column({ type: "varchar", length: 30 })
  phone!: string;

  @Column({ type: "varchar", length: 200 })
  addressLine1!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  addressLine2!: string | null;

  @Column({ type: "varchar", length: 20 })
  postcode!: string;

  @Column({ type: "varchar", length: 120 })
  town!: string;

  @Column({ type: "int", nullable: true })
  hasGardenId!: number | null;

  @Column({ type: "int", nullable: true })
  livingSituationId!: number | null;

  @Column({ type: "int", nullable: true })
  householdSettingId!: number | null;

  @Column({ type: "int", nullable: true })
  activityLevelId!: number | null;

  @Column({ type: "int", nullable: true })
  adults!: number | null;

  @Column({ type: "int", nullable: true })
  children!: number | null;

  @Column({ type: "int", nullable: true })
  visitingChildrenId!: number | null;

  @Column({ type: "int", nullable: true })
  hasFlatmatesId!: number | null;

  @Column({ type: "text", nullable: true })
  allergies!: string | null;

  @Column({ type: "int", nullable: true })
  otherAnimalsId!: number | null;

  @Column({ type: "text", nullable: true })
  otherAnimalsDetail!: string | null;

  @Column({ type: "int", nullable: true })
  neuteredId!: number | null;

  @Column({ type: "int", nullable: true })
  vaccinatedId!: number | null;

  @Column({ type: "text", nullable: true })
  experience!: string | null;

  @Column({ type: "boolean", default: false })
  acceptsTerms!: boolean;

  @Column({ type: "int", default: 1201 })
  statusId!: number;

  @Column({ type: "int", nullable: true })
  compatibilityScore!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
