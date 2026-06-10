import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ChatSession } from "./ChatSession.js";

/**
 * Mensaje de una sesión del chatbot.
 *
 * Persistimos el shape de OpenAI ChatCompletionMessageParam de forma genérica:
 * - role: "user" | "assistant" | "tool" | "system"
 * - content: el texto del mensaje (nullable porque un assistant con tool_calls
 *   puede no tener content)
 * - toolCallId: solo para mensajes role="tool", referencia al call que originó
 * - toolCalls: JSON con los tool_calls de un assistant message (cuando aplica)
 *
 * Esto nos permite reconstruir el historial al recargar la sesión sin perder
 * información estructural.
 */
@Entity("chat_message")
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: "session_id", type: "uuid" })
  sessionId!: string;

  @ManyToOne(() => ChatSession, (s) => s.messages, { onDelete: "CASCADE" })
  @JoinColumn({ name: "session_id" })
  session!: ChatSession;

  @Column({ type: "varchar", length: 20 })
  role!: string;

  @Column({ type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "tool_call_id", type: "varchar", length: 80, nullable: true })
  toolCallId!: string | null;

  /** JSON con el array de tool_calls cuando role="assistant". */
  @Column({ name: "tool_calls", type: "jsonb", nullable: true })
  toolCalls!: unknown | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
