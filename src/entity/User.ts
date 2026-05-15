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

  @Column({ name: "refresh_token_hash", nullable: true, type: "varchar", length: 128 })
  refreshTokenHash!: string | null;

  @Column({ name: "email_verified", type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ name: "email_verification_token_hash", nullable: true, type: "varchar", length: 128 })
  emailVerificationTokenHash!: string | null;

  @Column({ name: "sso_provider", nullable: true, type: "varchar", length: 40 })
  ssoProvider!: string | null;

  @Column({ name: "sso_subject", nullable: true, type: "varchar", length: 200 })
  ssoSubject!: string | null;

  @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: "boolean", default: false })
  adopter!: boolean;
  @Column({ nullable: true, type: "varchar", length: 500 })
  photo!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
