import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

export enum UserRole {
  USER = "user",
  ADMIN = "admin",
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 200, unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "varchar" })
  passwordHash!: string;

  @Column({ name: "password_salt", type: "varchar" })
  passwordSalt!: string;

  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: "boolean", default: false })
  adopter!: boolean;

  @Column({ nullable: true, type: "varchar", length: 500 })
  photo!: string | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  firstName!: string | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  lastName!: string | null;

  @Column({ nullable: true, type: "varchar", length: 30 })
  phone!: string | null;

  @Column({ nullable: true, type: "varchar", length: 200 })
  addressLine1!: string | null;

  @Column({ nullable: true, type: "varchar", length: 200 })
  addressLine2!: string | null;

  @Column({ nullable: true, type: "varchar", length: 20 })
  postcode!: string | null;

  @Column({ nullable: true, type: "varchar", length: 120 })
  town!: string | null;

  @Column({ nullable: true, type: "boolean" })
  hasGarden!: boolean | null;

  @Column({ nullable: true, type: "varchar", length: 40 })
  livingSituation!: string | null;

  @Column({ nullable: true, type: "varchar", length: 40 })
  householdSetting!: string | null;

  @Column({ nullable: true, type: "varchar", length: 40 })
  activityLevel!: string | null;

  @Column({ nullable: true, type: "int" })
  adults!: number | null;

  @Column({ nullable: true, type: "int" })
  children!: number | null;

  @Column({ nullable: true, type: "boolean" })
  visitingChildren!: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  hasFlatmates!: boolean | null;

  @Column({ nullable: true, type: "text" })
  allergies!: string | null;

  @Column({ nullable: true, type: "boolean" })
  otherAnimals!: boolean | null;

  @Column({ nullable: true, type: "text" })
  otherAnimalsDetail!: string | null;

  @Column({ nullable: true, type: "boolean" })
  neutered!: boolean | null;

  @Column({ nullable: true, type: "boolean" })
  vaccinated!: boolean | null;

  @Column({ nullable: true, type: "text" })
  experience!: string | null;

  @Column({ nullable: true, type: "varchar", length: 20 })
  preferredAnimal!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
