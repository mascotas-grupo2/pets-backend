import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";
import { CatalogIds } from "../lib/catalog-constants.js";

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

  @Column({ name: "password_reset_token_hash", nullable: true, type: "varchar", length: 128 })
  passwordResetTokenHash!: string | null;

  @Column({ name: "password_reset_expires_at", nullable: true, type: "timestamp" })
  passwordResetExpiresAt!: Date | null;

  @Column({ name: "sso_provider_id", nullable: true, type: "int" })
  ssoProviderId!: number | null;

  @Column({ name: "sso_subject", nullable: true, type: "varchar", length: 200 })
  ssoSubject!: string | null;

  @Column({ name: "role_id", type: "int", default: CatalogIds.userRole.user })
  roleId!: number;

  @Column({ name: "refugio_id", type: "int", nullable: true })
  refugioId!: number | null;

  @Column({ type: "boolean", default: false })
  adopter!: boolean;

  @Column({ nullable: true, type: "text" })
  photo!: string | null;

  @Column({ name: "status_id", type: "int", default: CatalogIds.userStatus?.activo ?? 0 })
  statusId!: number;

  @Column({ name: "evaluation_note", type: "text", nullable: true })
  evaluationNote!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
