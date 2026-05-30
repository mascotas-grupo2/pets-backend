import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";

export type ParticipantRole = "admin" | "member";

/**
 * Vínculo usuario ↔ conversación. Define quién puede ver/escribir y, por su
 * `lastReadAt`, cuántos mensajes tiene sin leer cada uno. `userId` es nulo para
 * contrapartes no registradas (invitados); en ese caso `displayName` las nombra.
 */
@Entity("conversation_participant")
@Unique("UQ_participant_conversation_user", ["conversationId", "userId"])
export class ConversationParticipant {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  conversationId: string;

  @Index()
  @Column({ type: "int", nullable: true })
  userId: number | null;

  @Column({ type: "varchar", length: 120 })
  displayName: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  email: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  phone: string | null;

  @Column({ type: "varchar", length: 16, default: "member" })
  role: ParticipantRole;

  @Column({ type: "timestamptz", nullable: true })
  lastReadAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
