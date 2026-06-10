import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { ChatMessage } from "./ChatMessage.js";

/**
 * Sesión conversacional del chatbot.
 *
 * - El id es un UUID generado por la API (igual que antes, cuando estaba en
 *   memoria), así no rompemos el contrato con los clientes.
 * - userId es nullable: el chatbot admite sesiones anónimas (las tools de
 *   lectura no requieren auth).
 * - lastIntent es metadata para observabilidad (qué intent inferimos en el
 *   último turno).
 */
@Entity("chat_session")
export class ChatSession {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Index()
  @Column({ name: "user_id", type: "int", nullable: true })
  userId!: number | null;

  @Column({ name: "last_intent", type: "varchar", length: 80, nullable: true })
  lastIntent!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => ChatMessage, (m) => m.session)
  messages!: ChatMessage[];
}
