import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

export type ChatChannel = "usuario" | "interno";

@Entity("conversation")
export class Conversation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 200 })
  subject: string;

  /** Bajada corta para la lista, ej. "Solicitud de Luna". */
  @Column({ type: "varchar", length: 160 })
  context: string;

  @Column({ type: "varchar", length: 16, default: "usuario" })
  channel: ChatChannel;

  @Column({ type: "varchar", length: 120, nullable: true })
  petName: string | null;

  @Column({ type: "timestamptz", nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
