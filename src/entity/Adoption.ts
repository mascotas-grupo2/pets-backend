import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity()
export class Adoption {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "int", nullable: true })
  userId!: number | null;

  @Column({ type: "uuid", nullable: true })
  petId!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  preferredAnimal!: string | null;

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

  // store yes/no/empty as small varchar to preserve frontend values
  @Column({ type: "varchar", length: 4, nullable: true })
  hasGarden!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  livingSituation!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  householdSetting!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  activityLevel!: string | null;

  @Column({ type: "int", nullable: true })
  adults!: number | null;

  @Column({ type: "int", nullable: true })
  children!: number | null;

  @Column({ type: "varchar", length: 4, nullable: true })
  visitingChildren!: string | null;

  @Column({ type: "varchar", length: 4, nullable: true })
  hasFlatmates!: string | null;

  @Column({ type: "text", nullable: true })
  allergies!: string | null;

  @Column({ type: "varchar", length: 4, nullable: true })
  otherAnimals!: string | null;

  @Column({ type: "text", nullable: true })
  otherAnimalsDetail!: string | null;

  @Column({ type: "varchar", length: 4, nullable: true })
  neutered!: string | null;

  @Column({ type: "varchar", length: 4, nullable: true })
  vaccinated!: string | null;

  @Column({ type: "text", nullable: true })
  experience!: string | null;

  @Column({ type: "boolean", default: false })
  acceptsTerms!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
